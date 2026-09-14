import { render, screen, within } from "__support__/ui";
import {
  createMockDataSensitivityFieldResult,
  createMockDataSensitivityTableResult,
} from "metabase-types/api/mocks";

import { DataSensitivityResultsTable } from "./DataSensitivityResultsTable";
import { getDataSensitivityRows } from "./utils";

const TABLE = createMockDataSensitivityTableResult({
  table_name: "PEOPLE",
  schema: "PUBLIC",
  fields: [
    createMockDataSensitivityFieldResult({
      field_id: 1,
      display_name: "ID",
      current: {
        data_sensitivity: "PUBLIC",
        human_set: false,
        state: "classifier",
        semantic_type: "type/PK",
      },
      proposed: {
        data_sensitivity: "PUBLIC",
        confidence: "high",
        semantic_type: null,
        reasoning: null,
      },
      status: "agree",
    }),
    createMockDataSensitivityFieldResult({
      field_id: 2,
      display_name: "Email",
      status: "new",
    }),
    createMockDataSensitivityFieldResult({
      field_id: 3,
      display_name: "Notes",
      current: {
        data_sensitivity: "PUBLIC",
        human_set: true,
        state: "human",
        semantic_type: null,
      },
      proposed: {
        data_sensitivity: "PHI",
        confidence: "low",
        semantic_type: "type/Description",
        reasoning: "Mentions diagnoses.",
      },
      semantic_changed: true,
      status: "disagree",
    }),
  ],
});

function getRowTexts() {
  const [, ...rows] = screen.getAllByRole("row");
  return rows.map((row) =>
    within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  );
}

describe("DataSensitivityResultsTable", () => {
  it("sorts differences before new fields and agreements", () => {
    render(
      <DataSensitivityResultsTable rows={getDataSensitivityRows([TABLE])} />,
    );

    expect(getRowTexts()).toEqual([
      [
        "PUBLIC.PEOPLE",
        "Notes",
        "Public(set by a person)",
        "Health information",
        "Low",
        "Description",
        "Differs",
      ],
      [
        "PUBLIC.PEOPLE",
        "Email",
        "Not scanned",
        "Personal information",
        "High",
        "",
        "New",
      ],
      ["PUBLIC.PEOPLE", "ID", "Public", "Public", "High", "", "Agrees"],
    ]);
  });

  it("shows an empty message when there are no rows", () => {
    render(<DataSensitivityResultsTable rows={[]} />);

    expect(screen.getByText("No fields to show.")).toBeInTheDocument();
  });
});
