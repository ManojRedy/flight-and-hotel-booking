import { createUser, createAccount } from "../services/user";
import { User } from "../db/models";
import { z } from "zod";
import bcrypt from "bcrypt";
import countryInfo from "../../data/countryInfo.json";
import emailDefaultData from "@/data/emailDefaultData";
import { newUserSignupEmailTemplate } from "../email/templates";
import sendEmail from "../email/sendEmail";
import { isValidJSON } from "../utils";
import {
  createAnalytics,
  incOrDecrementAnalytics,
} from "../services/analytics";

export async function signUpAction(prevState, formData) {
  const signUpValidation = validateSignupFormData(Object.fromEntries(formData));

  if (signUpValidation?.error) {
    return signUpValidation;
  }

  if (signUpValidation.success === true) {
    const isUserExist = await User.exists({
      email: signUpValidation.data.email,
    });

    if (isUserExist) {
      return { success: false, error: { email: "User already exists" } };
    }

    const data = signUpValidation.data;
    const passwordHash = await bcrypt.hash(data.password, 10);
    data.password = passwordHash;

    try {
      // 1️⃣ Create analytics & user directly (no transactions)
      await createAnalytics();

      const { _id: userId } = await createUser({
        firstName: data.firstname,
        lastName: data.lastname,
        email: data.email,
        phone: data.phone,
      });

      await createAccount({
        userId,
        provider: "credentials",
        providerAccountId: userId,
        type: "credentials",
        password: data.password,
      });

      await incOrDecrementAnalytics({ totalUsersSignedUp: 1 });

      // 2️⃣ Send Welcome Email
      const htmlEmail = newUserSignupEmailTemplate({
        ...emailDefaultData,
        main: { firstName: data.firstname },
      });

      await sendEmail(
        [{ Email: data.email }],
        "Welcome to Golobe",
        htmlEmail,
      );

      return { success: true, message: "User created successfully" };
    } catch (err) {
      console.error("Signup error:", err);
      return { success: false, message: "Something went wrong, try again" };
    }
  }
}

// Validation schema (same as before)
const phoneSchema = z.object({
  number: z.string().trim().regex(/^\d+$/, "Invalid phone number. Only numbers are allowed"),
  dialCode: z.string().trim().min(1, "Dial code is required"),
});

const signupSchema = z
  .object({
    email: z.string().trim().min(1, "Email is required").email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
    firstname: z.string().trim().min(1, "First name is required"),
    lastname: z.string().trim().min(1, "Last name is required"),
    acceptTerms: z.string().regex(/on/, { message: "You must accept the terms and conditions" }),
    phone: z
      .string()
      .optional()
      .transform((val) => {
        let phone = undefined;
        if (isValidJSON(val)) {
          const p = JSON.parse(val);
          if (Object.values(p).some(Boolean)) {
            phone = p;
          }
        }
        return phone;
      })
      .pipe(phoneSchema.optional()),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function validateSignupFormData(formData) {
  const result = signupSchema.safeParse(formData);

  if (!result.success) {
    const errors = {};
    result.error.issues.forEach((issue) => {
      errors[issue.path[0]] = issue.message;
    });
    return { success: false, error: errors };
  }

  return { success: true, data: result.data };
}
