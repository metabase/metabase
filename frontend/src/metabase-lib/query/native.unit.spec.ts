import * as Lib from "metabase-lib";

import { SAMPLE_DATABASE, SAMPLE_METADATA } from "./test-helpers";

describe("native query template tags", () => {
  let metadataProvider: Lib.MetadataProvider;

  beforeEach(() => {
    metadataProvider = Lib.metadataProvider(
      SAMPLE_DATABASE.id,
      SAMPLE_METADATA,
    );
  });

  it("should preserve required attribute when creating native query (metabase#38263)", () => {
    const queryText = "SELECT * FROM orders WHERE state = {{state}}";
    const query = Lib.nativeQuery(
      SAMPLE_DATABASE.id,
      metadataProvider,
      queryText,
    );

    const templateTags = {
      state: {
        id: "5b1cf042-45b0-4b4d-90e2-008973dc0358",
        name: "state",
        "display-name": "State",
        type: "text" as const,
        required: true,
        default: null,
      },
    };

    const queryWithTags = Lib.withTemplateTags(query, templateTags);
    const updatedQuery = Lib.withNativeQuery(queryWithTags, queryText);
    const retrievedTags = Lib.templateTags(updatedQuery);

    expect(retrievedTags!.state.required).toBe(true);
  });

  it("should preserve required=false attribute (metabase#38263)", () => {
    const queryText = "SELECT * FROM orders WHERE state = {{state}}";
    const query = Lib.nativeQuery(
      SAMPLE_DATABASE.id,
      metadataProvider,
      queryText,
    );

    // Set template tags with required=false
    const templateTags = {
      state: {
        id: "state-id",
        name: "state",
        "display-name": "State",
        type: "text" as const,
        required: false,
        default: "CA",
      },
    };

    const queryWithTags = Lib.withTemplateTags(query, templateTags);
    const retrievedTags = Lib.templateTags(queryWithTags);

    expect(retrievedTags!.state.required).toBe(false);
  });
});
