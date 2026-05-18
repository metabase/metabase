import { metadataProvider } from "metabase-lib/query/metadata";

import { SAMPLE_DATABASE, SAMPLE_METADATA } from "./test-helpers";

describe("metadataProvider", () => {
  // this is a very important optimization that the FE heavily relies upon
  it("should return the same object for the same database id and metadata", () => {
    const metadataProvider1 = metadataProvider(
      SAMPLE_DATABASE.id,
      SAMPLE_METADATA,
    );
    const metadataProvider2 = metadataProvider(
      SAMPLE_DATABASE.id,
      SAMPLE_METADATA,
    );
    expect(metadataProvider1).toBe(metadataProvider2);
  });
});
