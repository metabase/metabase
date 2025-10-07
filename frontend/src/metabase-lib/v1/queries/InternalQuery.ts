import type { DatasetQuery, OpaqueDatasetQuery } from "metabase-types/api";

export class InternalQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery | OpaqueDatasetQuery) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return datasetQuery?.type === "internal";
  }
}
