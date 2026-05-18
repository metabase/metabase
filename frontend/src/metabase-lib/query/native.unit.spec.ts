import { metadataProvider } from "metabase-lib/query/metadata";
import {
  templateTags as getTemplateTags,
  nativeQuery,
  withNativeQuery,
  withTemplateTags,
} from "metabase-lib/query/native";
import type { MetadataProvider } from "metabase-lib/query/types";

import { SAMPLE_DATABASE, SAMPLE_METADATA } from "./test-helpers";

describe("native query template tags", () => {
  let provider: MetadataProvider;

  beforeEach(() => {
    provider = metadataProvider(SAMPLE_DATABASE.id, SAMPLE_METADATA);
  });

  it("should preserve required attribute when creating native query (metabase#38263)", () => {
    const queryText = "SELECT * FROM orders WHERE state = {{state}}";
    const query = nativeQuery(SAMPLE_DATABASE.id, provider, queryText);

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

    const queryWithTags = withTemplateTags(query, templateTags);
    const updatedQuery = withNativeQuery(queryWithTags, queryText);
    const retrievedTags = getTemplateTags(updatedQuery);

    expect(retrievedTags.state.required).toBe(true);
  });

  it("should preserve required=false attribute (metabase#38263)", () => {
    const queryText = "SELECT * FROM orders WHERE state = {{state}}";
    const query = nativeQuery(SAMPLE_DATABASE.id, provider, queryText);

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

    const queryWithTags = withTemplateTags(query, templateTags);
    const retrievedTags = getTemplateTags(queryWithTags);

    expect(retrievedTags.state.required).toBe(false);
  });
});
