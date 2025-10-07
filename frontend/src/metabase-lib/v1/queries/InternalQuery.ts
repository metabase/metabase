import type { DatasetQuery } from "metabase-types/api";

export class InternalQuery {
  static isDatasetQueryType(datasetQuery: DatasetQuery) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return datasetQuery?.type === "internal";
  }
}
