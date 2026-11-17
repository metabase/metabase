import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";
import {
  createMockFingerprint,
  createMockNumberFieldFingerprint,
} from "metabase-types/api/mocks";
import {
  REVIEWS_ID,
  createReviewsBodyField,
  createReviewsCreatedAtField,
  createReviewsIdField,
  createReviewsProductIdField,
  createReviewsRatingField,
  createReviewsReviewerField,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { columnFinder, createMetadataProvider } from "./test-helpers";

// A synced ID column has a numeric fingerprint with min/max, unlike the
// stock sample-database mock where ID has no fingerprint at all.
const NUMERIC_FINGERPRINT = createMockFingerprint({
  type: {
    "type/Number": createMockNumberFieldFingerprint({ min: 1, max: 1112 }),
  },
});

function createReviewsIdQuery(semanticType: Field["semantic_type"]) {
  const database = createSampleDatabase({
    tables: [
      createReviewsTable({
        fields: [
          createReviewsIdField({
            effective_type: "type/BigInteger",
            semantic_type: semanticType,
            fingerprint: NUMERIC_FINGERPRINT,
          }),
          createReviewsProductIdField(),
          createReviewsReviewerField(),
          createReviewsRatingField(),
          createReviewsBodyField(),
          createReviewsCreatedAtField(),
        ],
      }),
    ],
  });
  const provider = createMetadataProvider({
    metadata: createMockMetadata({ databases: [database] }),
  });
  const query = Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: REVIEWS_ID } }],
  });
  const findColumn = columnFinder(query, Lib.breakoutableColumns(query, 0));
  return { query, column: findColumn("REVIEWS", "ID") };
}

function getBinningStrategyNames(semanticType: Field["semantic_type"]) {
  const { query, column } = createReviewsIdQuery(semanticType);
  return Lib.availableBinningStrategies(query, 0, column).map(
    (strategy) => Lib.displayInfo(query, 0, strategy).displayName,
  );
}

describe("availableBinningStrategies", () => {
  it("should not offer binning for a PK column even when it has a numeric fingerprint (metabase#17768)", () => {
    expect(getBinningStrategyNames("type/PK")).toEqual([]);
  });

  it.each<Field["semantic_type"]>([null, "type/Category"])(
    "should offer numeric binning for the same column with a %s semantic type",
    (semanticType) => {
      expect(getBinningStrategyNames(semanticType)).toEqual([
        "Auto bin",
        "10 bins",
        "50 bins",
        "100 bins",
      ]);
    },
  );
});
