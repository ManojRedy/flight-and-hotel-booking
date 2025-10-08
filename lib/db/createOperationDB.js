import { capitalize, findOnlyUniqueElements } from "../utils";
import dataModels from "./models";
import { connectToDB } from "./utilsDB";

await connectToDB();

/**
 * Creates one document in the given model.
 *
 * @param {String} modelName - Name of the mongoose model to be used for creating the document.
 * @param {Object} data - Data to be saved in the document.
 * @returns {Promise<Document>} - The created document.
 * @throws {Error} - If there is an error, such as validation error or wrong model name.
 */
export async function createOneDoc(modelName, data) {
  const result = await validatorOneDoc(modelName, data);
  if (result instanceof Error) throw result;

  try {
    const doc = new dataModels[result.modelName](result.data);
    // Save without session (standalone MongoDB)
    return await doc.save();
  } catch (error) {
    console.log(error);
    throw error;
  }
}

async function validatorOneDoc(modelName, data) {
  if (typeof modelName !== "string") {
    return new Error(
      `${modelName} is not a string. modelName must be a string`
    );
  }

  let processedModelName = capitalize(modelName.trim());
  processedModelName =
    processedModelName[0].toUpperCase() + processedModelName.slice(1);

  if (!dataModels[processedModelName]) {
    return new Error(`"${processedModelName}" is not a valid model`);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return new Error(`${data} is not an object. data must be an object`);
  }

  const modelSchemaKeys = Object.keys(dataModels[processedModelName].schema.obj);
  const dataKeys = Object.keys(data);

  const extraKeys = findOnlyUniqueElements(
    dataKeys,
    [...modelSchemaKeys, "_id"],
    [...modelSchemaKeys, "_id"]
  );

  if (extraKeys.length > 0) {
    return new Error(
      `The following keys are not allowed: ${extraKeys.join(
        ", "
      )}, Only ${modelSchemaKeys.join(", ")} are allowed`
    );
  }

  try {
    await dataModels[processedModelName].validate(data, modelSchemaKeys);
    return {
      modelName: processedModelName,
      data: data,
    };
  } catch (error) {
    return error;
  }
}

/**
 * Creates multiple documents in the given model.
 *
 * @param {String} modelName - Name of the mongoose model to be used.
 * @param {Array} dataArr - Array of documents to insert.
 * @returns {Array} - Array of inserted document IDs as strings.
 */
export async function createManyDocs(modelName, dataArr) {
  modelName = capitalize(modelName.trim());

  try {
    // Map documents for bulkWrite without sessions
    const bulkOperations = dataArr.map((doc) => ({
      insertOne: { document: doc },
    }));

    const result = await dataModels[modelName].bulkWrite(bulkOperations);

    return Object.values(result.insertedIds).map((id) => id.toString());
  } catch (error) {
    console.log(error);
    throw error;
  }
}
