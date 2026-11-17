import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Field } from "metabase-types/api";
import {
  createMockFingerprint,
  createMockNumberFieldFingerprint,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
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

import type { QueryColumnPickerProps } from "./QueryColumnPicker";
import { QueryColumnPicker } from "./QueryColumnPicker";

type SetupOpts = Partial<
  Pick<
    QueryColumnPickerProps,
    "query" | "stageIndex" | "hasBinning" | "hasTemporalBucketing"
  >
> & {
  columns?: Lib.ColumnMetadata[];
};

function createQueryWithBreakout() {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        breakouts: [
          {
            type: "column",
            name: "CREATED_AT",
          },
        ],
      },
    ],
  });

  const [clause] = Lib.breakouts(query, 0);
  const clauseInfo = Lib.displayInfo(query, 0, clause);
  return { query, clause, clauseInfo };
}

function setup({
  query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  stageIndex = 0,
  columns = Lib.breakoutableColumns(query, stageIndex),
  hasBinning = true,
  hasTemporalBucketing = true,
  ...props
}: SetupOpts = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();

  const findColumn = columnFinder(query, columns);

  const sampleColumn = findColumn("ORDERS", "ID");
  const sampleColumnInfo = Lib.displayInfo(query, 0, sampleColumn);

  renderWithProviders(
    <QueryColumnPicker
      {...props}
      query={query}
      stageIndex={stageIndex}
      columnGroups={Lib.groupColumns(columns)}
      hasBinning={hasBinning}
      hasTemporalBucketing={hasTemporalBucketing}
      checkIsColumnSelected={({ breakoutPositions = [] }) =>
        breakoutPositions.length > 0
      }
      onSelect={onSelect}
      onClose={onClose}
    />,
  );

  return { sampleColumn, sampleColumnInfo, onSelect, onClose };
}

// Mirrors a synced REVIEWS.ID: unlike the stock mock, it has a numeric
// fingerprint with min/max, so only its semantic type decides binning.
function createReviewsQuery(idSemanticType: Field["semantic_type"]) {
  const database = createSampleDatabase({
    tables: [
      createReviewsTable({
        fields: [
          createReviewsIdField({
            effective_type: "type/BigInteger",
            semantic_type: idSemanticType,
            fingerprint: createMockFingerprint({
              type: {
                "type/Number": createMockNumberFieldFingerprint({
                  min: 1,
                  max: 1112,
                }),
              },
            }),
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
  return Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: REVIEWS_ID } }],
  });
}

function setupReviews(idSemanticType: Field["semantic_type"]) {
  const query = createReviewsQuery(idSemanticType);
  renderWithProviders(
    <QueryColumnPicker
      query={query}
      stageIndex={0}
      columnGroups={Lib.groupColumns(Lib.breakoutableColumns(query, 0))}
      hasBinning
      hasTemporalBucketing
      checkIsColumnSelected={() => false}
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />,
  );
}

describe("QueryColumnPicker", () => {
  it("should display columns grouped by tables", () => {
    setup();

    // Tables
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();

    // Columns
    expect(screen.getByRole("option", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "User ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tax" })).toBeInTheDocument();
  });

  it("should display column from foreign tables", async () => {
    setup();

    await userEvent.click(screen.getByText("Product"));

    expect(screen.getByRole("option", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Price" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Category" }),
    ).toBeInTheDocument();
  });

  it("should allow picking a column", async () => {
    const { sampleColumn, sampleColumnInfo, onSelect, onClose } = setup();

    await userEvent.click(screen.getByText(sampleColumnInfo.displayName));

    expect(onSelect).toHaveBeenCalledWith(sampleColumn);
    expect(onClose).toHaveBeenCalled();
  });

  it("should render info icons", () => {
    setup();
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("should highlight column used in a given clause", () => {
    const { query, clauseInfo } = createQueryWithBreakout();
    setup({ query });

    const option = screen.getByRole("option", { name: clauseInfo.displayName });
    expect(option).toBeInTheDocument();
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  describe("bucketing", () => {
    it("should show binning picker for numeric columns", () => {
      setup();

      const total = screen.getByRole("option", { name: "Total" });
      expect(
        within(total).getByLabelText("Binning strategy"),
      ).toBeInTheDocument();
    });

    it("should show temporal bucket picker for date columns", () => {
      setup();

      const createdAt = screen.getByRole("option", { name: "Created At" });
      expect(
        within(createdAt).getByLabelText("Temporal bucket"),
      ).toBeInTheDocument();
    });

    it("shouldn't show bucketing options for non-bucketable columns", () => {
      setup();

      const id = screen.getByRole("option", { name: "ID" });

      expect(
        within(id).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(id).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();
    });

    it("shouldn't show a binning picker for a PK column with a numeric fingerprint (metabase#17768)", () => {
      setupReviews("type/PK");

      const id = screen.getByRole("option", { name: "ID" });
      expect(
        within(id).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(within(id).queryByText("Auto bin")).not.toBeInTheDocument();

      const rating = screen.getByRole("option", { name: "Rating" });
      expect(
        within(rating).getByLabelText("Binning strategy"),
      ).toHaveTextContent("Auto bin");
    });

    it("should show a binning picker for the same column when it is not a PK", () => {
      setupReviews("type/Category");

      const id = screen.getByRole("option", { name: "ID" });
      expect(within(id).getByLabelText("Binning strategy")).toHaveTextContent(
        "Auto bin",
      );
    });

    it("shouldn't show bucketing options if bucketing is disabled", () => {
      setup({ hasBinning: false, hasTemporalBucketing: false });

      const total = screen.getByRole("option", { name: "Total" });
      const createdAt = screen.getByRole("option", { name: "Created At" });

      expect(
        within(total).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(createdAt).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();
    });
  });

  it("should allow searching using displayName (#39622)", async () => {
    setup();

    await userEvent.click(screen.getByText("User"));
    fireEvent.change(screen.getByTestId("list-search-field"), {
      target: { value: "Birth Date" },
    });

    expect(
      screen.getByRole("option", { name: "Birth Date" }),
    ).toBeInTheDocument();
  });
});
