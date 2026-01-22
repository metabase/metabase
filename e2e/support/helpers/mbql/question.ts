import type * as Lib from "metabase-lib";
import type { CreateTestQueryOpts } from "metabase-lib/test-helpers";
import type { Card, DatabaseId } from "metabase-types/api";

import type { QuestionDetails } from "../api";
import { type Options, question } from "../api/createQuestion";

import type { GetMetadataOpts } from "./types";
import { createTestJsQuery, createTestNativeJsQuery } from "./wrappers";

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

/**
 * Create a test question using the provided details.
 *
 * The details can either be a plain question using `dataset_query`.
 *
 * @example -
 *   //  Legacy dataset_query
 *   H.createTestQuestion({
 *     name: "My question",
 *     dataset_query: {
 *       type: "query",
 *       "source-table": ORDERS_ID,
 *     }
 *   })
 *
 *
 * @example
 *   // Custom mbql query
 *   H.createTestJsQuestion(...).then(dataset_query) => {
 *    H.createTestQuestion({
 *      name: "My question",
 *      dataset_query,
 *    })
 *  })
 *
 * @example
 *
 *    // Directly provide the mbql query details to avoid nesting
 *    // Equivalent to the example above.
 *    H.createTestQuestion({
 *      name: "My question",
 *      query: {
 *        databaseId: SAMPLE_DATABASE_ID,
 *        stages: [
 *          ...
 *        ]
 *      }
 *    })
 *  })
 *
 * @example
 *    // Directly provide the native mbql query details to avoid nesting
 *    H.createTestQuestion({
 *      name: "My question",
 *      databaseId: SAMPLE_DATABASE_ID,
 *      query: "SELECT * FROM orders"
 *    })
 *  })
 *
 * @example
 *    // Pass custom metadata options
 *    H.createTestQuestion({
 *      name: "My question",
 *      databaseId: SAMPLE_DATABASE_ID,
 *      metadata: {
 *        databaseId: SAMPLE_DATABASE_ID,
 *        cards: [SAMPLE_CARD_ID],
 *      },
 *      query: "SELECT * FROM orders"
 *    })
 *  })
 */
export function createTestQuestion(
  details: TestQuestionDetails,
  options?: Options,
): Cypress.Chainable<Cypress.Response<Card>> {
  if ("dataset_query" in details) {
    // Plain question details, pass through details as is
    return question(details, options);
  } else if (isStructuredTestQuestionDetails(details)) {
    // MBQL question details, pass through createTestJsQuery
    const { metadata = {}, query, ...rest } = details;
    return createTestJsQuery(metadata, query).then((dataset_query) =>
      question({
        ...rest,
        dataset_query,
      }),
    );
  } else if (isNativeTestQuestionDetails(details)) {
    // Native question details, pass through createTestNativeJsQuery
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
