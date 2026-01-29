import type * as Lib from "metabase-lib";
import type { CreateTestQueryOpts } from "metabase-lib/test-helpers";
import type { DatabaseId } from "metabase-types/api";

import type { QuestionDetails } from "../api";
import { type Options, question } from "../api/createQuestion";

import type { GetMetadataOpts } from "./types";
import { createNativeQuery, createQuery } from "./wrappers";

/**
 * Create a card using the provided details and a MBQL query.
 *
 * @param details.metadata -
 *  The metadata provider to use for the query,
 *  or options used to create one on the fly.
 *  If no metadata is provided, the query will be created with
 *  the default metadata provider.
 *
 * @example
 *    // If no metadata is provided, the card will be created with
 *    // the default metadata provider.
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
 *    // Provide custom metadata entities relevant to your query.
 *    H.createTestQuestion({
 *      name: "My question",
 *      databaseId: SAMPLE_DATABASE_ID,
 *      query: "SELECT * FROM orders"
 *    })
 *  })
 *
 */

type CardWithQueryDetails = Omit<QuestionDetails, "dataset_query"> & {
  metadata?: GetMetadataOpts | Lib.MetadataProvider;
  query: CreateTestQueryOpts;
};

export function createCardWithQuery(
  { metadata = {}, query, ...details }: CardWithQueryDetails,
  options: Options = {},
) {
  return createQuery(metadata, query).then((dataset_query) =>
    question({ ...details, dataset_query }, options),
  );
}

type CardWithNativeQueryDetails = Omit<QuestionDetails, "dataset_query"> & {
  metadata?: GetMetadataOpts | Lib.MetadataProvider;
  databaseId: DatabaseId;
  query: string;
};

/**
 * Create a card using the provided details and a native query.
 *
 * @param details.metadata -
 *  The metadata provider to use for the query,
 *  or options used to create one on the fly.
 *  If no metadata is provided, the query will be created with
 *  the default metadata provider.
 *
 * @example
 *    // If no metadata is provided, the card will be created with
 *    // the default metadata provider.
 *    H.createCardWithNativeQuery({
 *      name: "My question",
 *      databaseId: SAMPLE_DATABASE_ID,
 *      query: "SELECT * FROM orders"
 *    })
 *  })
 *
 * @example
 *    // Provide custom metadata entities relevant to your query.
 *    H.createCardWithNativeQuery({
 *      name: "My question",
 *      databaseId: SAMPLE_DATABASE_ID,
 *      metadata: {
 *        databaseId: SAMPLE_DATABASE_ID,
 *        cardIds: [SAMPLE_CARD_ID],
 *      },
 *      query: "SELECT * FROM orders"
 *    })
 *  })
 */
export function createCardWithNativeQuery(
  { metadata = {}, databaseId, query, ...details }: CardWithNativeQueryDetails,
  options: Options = {},
) {
  return createNativeQuery(metadata, databaseId, query).then((dataset_query) =>
    question({ ...details, dataset_query }, options),
  );
}
