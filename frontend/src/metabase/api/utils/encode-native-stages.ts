import type { DatasetQuery, InternalDatasetQuery } from "metabase-types/api";

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

export function encodeNativeStagesBase64(
  datasetQuery: DatasetQuery | InternalDatasetQuery,
): DatasetQuery | InternalDatasetQuery {

  if (!("lib/type" in datasetQuery)) {
    console.log(
      "encodeNativeStagesBase64: no lib/type in datasetQuery, returning as is",
    );
    return datasetQuery;
  }

  if (!("stages" in datasetQuery)) {
    console.log(
      "encodeNativeStagesBase64: no stages in datasetQuery, returning as is",
    );
    return datasetQuery;
  }

  if (datasetQuery["lib/type"] !== "mbql/query") {
    console.log(
      "encodeNativeStagesBase64: lib/type in datasetQuery is {}, which is different from mbql/query, returning as is",
      datasetQuery["lib/type"],
    );
    return datasetQuery;
  }

  const { stages } = datasetQuery;

  // MUST be an array
  if (!Array.isArray(stages)) {
    console.log(
      "encodeNativeStagesBase64: stages in datasetQuery is not an array, returning as is",
    );
    return datasetQuery;
  }

  const updatedStages = stages.map((stage) => {
    if (
      stage?.["lib/type"] === "mbql.stage/native" &&
      typeof stage.native === "string"
    ) {
      return {
        ...stage,
        // ❌ DO NOT base64 encode
        native: encodeBase64(stage.native),
      };
    }

    return stage;
  });

  datasetQuery["stages"] = updatedStages;

  return datasetQuery;
}

//Handling for NativeDatasetQuery
//   if (!("type" in datasetQuery)) {
//     console.log(
//       "encodeNativeStagesBase64: no type in datasetQuery, returning as is",
//     );
//     return datasetQuery;
//   }

//   if (datasetQuery.type !== "native") {
//     console.log(
//       "encodeNativeStagesBase64: datasetQuery is not a native query, returning as is",
//     );
//     return datasetQuery;
//   }

//   if (isNativeDatasetQuery(datasetQuery)) {
//     return {
//       ...datasetQuery,
//       native: {
//         ...datasetQuery.native,
//         query: encodeBase64(datasetQuery.native.query),
//       },
//     };
//   }
