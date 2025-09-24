import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createMockCard,
  createMockNativeQuerySnippet,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getValidationResult } from "./utils";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [createMockCard({ id: 1 })],
  snippets: [createMockNativeQuerySnippet({ id: 1, name: "MySnippet" })],
});

describe("getValidationResult", () => {
  const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, METADATA);

  it("should not return errors for a query without tags", () => {
    const query = Lib.nativeQuery(SAMPLE_DB_ID, metadataProvider, "SELECT 1");
    expect(getValidationResult(query)).toEqual({
      isValid: true,
    });
  });

  it("should not return errors for a query with card or snippet tags", () => {
    const query = Lib.nativeQuery(
      SAMPLE_DB_ID,
      metadataProvider,
      "SELECT * FROM {{#1-card}} {{snippet:MySnippet}}",
    );
    expect(getValidationResult(query)).toEqual({
      isValid: true,
    });
  });

  it("should mark the query as invalid but not return the error message for an empty query", () => {
    const query = Lib.nativeQuery(SAMPLE_DB_ID, metadataProvider, "");
    expect(getValidationResult(query)).toEqual({
      isValid: false,
      errorMessage: undefined,
    });
  });

  it("should return errors if there are variables", () => {
    const query = Lib.nativeQuery(
      SAMPLE_DB_ID,
      metadataProvider,
      "{{var1}} {{var2}}",
    );
    expect(getValidationResult(query)).toEqual({
      isValid: false,
      errorMessage: expect.stringContaining("variables"),
    });
  });

  it("should return errors if variables are mixed with tags that are allowed", () => {
    const query = Lib.nativeQuery(
      SAMPLE_DB_ID,
      metadataProvider,
      "{{snippet:MySnippet}} {{var}}",
    );
    expect(getValidationResult(query)).toEqual({
      isValid: false,
      errorMessage: expect.stringContaining("variables"),
    });
  });

  it("should still return the variable error if there are variables, even if there are syntax errors", () => {
    const query = Lib.nativeQuery(
      SAMPLE_DB_ID,
      metadataProvider,
      "{{snippet: }} {{var}}",
    );
    expect(getValidationResult(query)).toEqual({
      isValid: false,
      errorMessage: expect.stringContaining("variables"),
    });
  });
});
