import type * as Lib from "metabase-lib";

export interface BucketItem {
  name: string;
  bucket: Lib.Bucket | null;
}
