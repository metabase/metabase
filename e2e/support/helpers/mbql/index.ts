import type * as Lib from "metabase-lib";
import type { CreateTestQueryOpts } from "metabase-lib/test-helpers";
import type { Card, DatabaseId, OpaqueDatasetQuery } from "metabase-types/api";

import type { QuestionDetails } from "../api";
import { type Options, question } from "../api/createQuestion";

import type { GetMetadataOpts } from "./types";

export function getMetadataProvider(
  opts?: GetMetadataOpts,
): Cypress.Chainable<Lib.MetadataProvider> {
  return (
    cy
      // we need to log in before we can get metadata
      .getCookie("metabase.SESSION_ID")
      .then(() => _getMetadataProvider({ ...opts }))
  );
}

export async function _getMetadataProvider(
  opts?: GetMetadataOpts,
): Promise<Lib.MetadataProvider> {
  const { getMetadataProvider } = await import("./metadata-provider");
  return getMetadataProvider(opts);
}

export function createTestJsQuery(
  metadataProvider: Lib.MetadataProvider | GetMetadataOpts,
  opts: CreateTestQueryOpts,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return getProvider(metadataProvider).then((provider) => {
    return _createTestJsQuery(provider, opts);
  });
}

export async function _createTestJsQuery(
  metadataProvider: Lib.MetadataProvider,
  opts: CreateTestQueryOpts,
): Promise<OpaqueDatasetQuery> {
  const { createTestJsQuery } = await import("metabase-lib/test-helpers");
  return createTestJsQuery(metadataProvider, opts);
}

export function createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider | GetMetadataOpts,
  databaseId: DatabaseId,
  query: string,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return getProvider(metadataProvider).then((provider) =>
    _createTestNativeJsQuery(provider, databaseId, query),
  );
}

export async function _createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider,
  databaseId: DatabaseId,
  query: string,
) {
  const { createTestNativeJsQuery } = await import("metabase-lib/test-helpers");
  return createTestNativeJsQuery(metadataProvider, databaseId, query);
}

function isMetadataProvider(
  opts: GetMetadataOpts | Lib.MetadataProvider,
): opts is Lib.MetadataProvider {
  return "cache" in opts;
}

function getProvider(
  providerOrOpts: GetMetadataOpts | Lib.MetadataProvider,
): Cypress.Chainable<Lib.MetadataProvider> {
  if (isMetadataProvider(providerOrOpts)) {
    return cy.wrap(providerOrOpts);
  }
  return getMetadataProvider(providerOrOpts);
}

type TestQuestionDetails =
  | QuestionDetails
  | StructuredTestQuestionDetails
  | NativeTestQuestionDetails;

type NativeTestQuestionDetails = Omit<QuestionDetails, "dataset_query"> & {
  metadata?: GetMetadataOpts | Lib.MetadataProvider;
  databaseId: DatabaseId;
  query: string;
};

type StructuredTestQuestionDetails = Omit<QuestionDetails, "dataset_query"> & {
  metadata?: GetMetadataOpts | Lib.MetadataProvider;
  query: CreateTestQueryOpts;
};

function isNativeTestQuestionDetails(
  details: TestQuestionDetails,
): details is NativeTestQuestionDetails {
  return "query" in details && typeof details.query === "string";
}

function isStructuredTestQuestionDetails(
  details: TestQuestionDetails,
): details is StructuredTestQuestionDetails {
  return "query" in details && typeof details.query === "object";
}

export function createTestQuestion(
  details: TestQuestionDetails,
  options?: Options,
): Cypress.Chainable<Cypress.Response<Card>> {
  if ("dataset_query" in details) {
    // QuestionDetails
    return question(details, options);
  } else if (isStructuredTestQuestionDetails(details)) {
    const { metadata = {}, query, ...rest } = details;
    return createTestJsQuery(metadata, query).then((dataset_query) =>
      question({
        ...rest,
        dataset_query,
      }),
    );
  } else if (isNativeTestQuestionDetails(details)) {
    // NativeTestQuestionDetails
    const { metadata = {}, databaseId, query, ...rest } = details;
    return createTestNativeJsQuery(metadata, databaseId, query).then(
      (dataset_query) =>
        question({
          ...rest,
          dataset_query,
        }),
    );
  }
  throw new Error("Invalid question details");
}
