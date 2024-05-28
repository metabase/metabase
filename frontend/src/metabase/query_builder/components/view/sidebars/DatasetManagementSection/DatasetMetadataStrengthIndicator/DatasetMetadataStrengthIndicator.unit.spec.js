import { render, screen } from "@testing-library/react";

import DatasetMetadataStrengthIndicator from "./DatasetMetadataStrengthIndicator";

function setup({ resultMetadata } = {}) {
  const mockDataset = {
    getResultMetadata: () => resultMetadata,
  };
  render(
    <DatasetMetadataStrengthIndicator
      dataset={mockDataset}
      data-testid="indicator"
    />,
  );
}

describe("DatasetMetadataStrengthIndicator", () => {
  const FULLY_COMPLETE_METADATA = {
    id: 1,
    display_name: "ID",
    description: "Well, that's an ID",
    semantic_type: "type/PK",
  };
  const PARTIALLY_COMPLETE_METADATA = {
    id: 1,
    display_name: "ID",
    semantic_type: "type/PK",
  };
  const FULLY_INCOMPLETE_METADATA = { display_name: "CREATED_AT" };

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
  ].forEach(testCase => {
    const { name, resultMetadata, completenessPercent } = testCase;

    describe(name, () => {
      it("renders correctly", () => {
        setup({ resultMetadata });
        expect(screen.getByTestId("indicator")).toBeInTheDocument();
        expect(screen.getByText(completenessPercent)).toBeInTheDocument();
      });
    });
  });
});
