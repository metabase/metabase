import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { Field } from "metabase-types/api";
import { createMockCard, createMockField } from "metabase-types/api/mocks";

import { DatasetMetadataStrengthIndicator } from "./DatasetMetadataStrengthIndicator";

function setup({ resultMetadata }: { resultMetadata?: Field[] }) {
  const dataset = new Question(
    createMockCard({ result_metadata: resultMetadata ?? null }),
  );
  render(
    <DatasetMetadataStrengthIndicator
      dataset={dataset}
      data-testid="indicator"
    />,
  );
}

describe("DatasetMetadataStrengthIndicator", () => {
  const FULLY_COMPLETE_METADATA = createMockField({
    id: 1,
    display_name: "ID",
    description: "Well, that's an ID",
    semantic_type: "type/PK",
  });
  const PARTIALLY_COMPLETE_METADATA = createMockField({
    id: 1,
    display_name: "ID",
    semantic_type: "type/PK",
  });
  const FULLY_INCOMPLETE_METADATA = createMockField({
    display_name: "CREATED_AT",
  });

  it("doesn't render if result metadata is not defined", () => {
    setup({ resultMetadata: undefined });
    expect(screen.queryByTestId("indicator")).not.toBeInTheDocument();
  });

  it("doesn't render if result metadata is empty", () => {
    setup({ resultMetadata: [] });
    expect(screen.queryByTestId("indicator")).not.toBeInTheDocument();
  });

  [
    {
      name: "fully complete metadata (100%)",
      resultMetadata: [FULLY_COMPLETE_METADATA],
      completenessPercent: "100%",
    },
    {
      name: "half complete metadata (50%)",
      resultMetadata: [FULLY_COMPLETE_METADATA, FULLY_INCOMPLETE_METADATA],
      completenessPercent: "50%",
    },
    {
      name: "partially complete metadata",
      resultMetadata: [PARTIALLY_COMPLETE_METADATA],
      completenessPercent: "67%",
    },
    {
      name: "fully incomplete metadata (0%)",
      resultMetadata: [FULLY_INCOMPLETE_METADATA],
      completenessPercent: "0%",
    },
  ].forEach((testCase) => {
    const { name, resultMetadata, completenessPercent } = testCase;

    describe(name, () => {
      it("renders correctly", () => {
        setup({ resultMetadata });
        expect(screen.getByTestId("indicator")).toBeInTheDocument();
        expect(screen.getByText(completenessPercent)).toBeInTheDocument();
      });
    });
  });

  describe("tooltip", () => {
    // 9 columns, like the Orders table: 3 points each for a friendly name, a
    // description and a column type
    const createColumns = (count: number, opts: Partial<Field>): Field[] =>
      Array.from({ length: count }, (_, index) =>
        createMockField({ name: `COLUMN_${index}`, ...opts }),
      );

    it("says that some columns miss metadata when most of it is there", async () => {
      setup({
        resultMetadata: [
          ...createColumns(6, {
            display_name: "Total",
            description: "A description",
            semantic_type: "type/Category",
          }),
          ...createColumns(3, {
            display_name: "Subtotal",
            description: "A description",
            semantic_type: null,
          }),
        ],
      });

      await userEvent.hover(screen.getByText("89%"));

      const tooltip = await screen.findByTestId("tooltip-content");
      expect(tooltip).toHaveTextContent(
        "Some columns are missing a column type, description, or friendly name.",
      );
      expect(tooltip).toHaveTextContent(
        "Adding metadata makes it easier for your team to explore this data.",
      );
    });

    it("says that most columns miss metadata when little of it is there", async () => {
      setup({
        resultMetadata: [
          ...createColumns(4, {
            display_name: "TOTAL",
            description: null,
            semantic_type: "type/Category",
          }),
          ...createColumns(2, {
            display_name: "TAX",
            description: null,
            semantic_type: null,
          }),
          ...createColumns(3, {
            display_name: "USER_ID",
            description: null,
            semantic_type: null,
          }),
        ],
      });

      await userEvent.hover(screen.getByText("37%"));

      const tooltip = await screen.findByTestId("tooltip-content");
      expect(tooltip).toHaveTextContent(
        "Most columns are missing a column type, description, or friendly name.",
      );
      expect(tooltip).toHaveTextContent(
        "Adding metadata makes it easier for your team to explore this data.",
      );
    });
  });
});
