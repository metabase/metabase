import { setupRunInspectorQueryEndpoint } from "__support__/server-mocks/transform";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  InspectorAlertTrigger,
  InspectorCard,
  InspectorDrillLensTrigger,
  InspectorSection,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockInspectorCard,
  createMockTransform,
  createMockTransformInspectSource,
} from "metabase-types/api/mocks";

import { LensContentProvider } from "../../LensContent/LensContentContext";

import { DefaultLensSections } from "./DefaultLensSections";

jest.mock("metabase/transforms/lib/transforms-inspector", () => ({
  ...jest.requireActual("metabase/transforms/lib/transforms-inspector"),
  computeCardStats: () => null,
}));

const scalarCard1 = createMockInspectorCard({
  id: "card-1",
  title: "Row Count",
  display: "scalar",
});

const scalarCard2 = createMockInspectorCard({
  id: "card-2",
  title: "Column Count",
  display: "scalar",
});

const mockAlerts: InspectorAlertTrigger[] = [
  {
    id: "alert-1",
    severity: "warning",
    message: "Row count dropped significantly",
    condition: { name: "row_count_drop", card_id: "card-1" },
  },
  {
    id: "alert-2",
    severity: "error",
    message: "Missing values detected",
    condition: { name: "missing_values", card_id: "card-2" },
  },
];

const mockDrillLenses: InspectorDrillLensTrigger[] = [
  {
    lens_id: "drill-lens-1",
    reason: "missing values",
    condition: { name: "missing_values_drill", card_id: "card-1" },
  },
  {
    lens_id: "drill-lens-2",
    reason: "distribution anomaly",
    condition: { name: "distribution_drill", card_id: "card-2" },
  },
];

const defaultSections: InspectorSection[] = [
  { id: "section-1", title: "Overview" },
];

function setup({
  sections = defaultSections,
  cardsBySection = { "section-1": [scalarCard1, scalarCard2] },
  alertsByCardId = {} satisfies Record<string, InspectorAlertTrigger[]>,
  drillLensesByCardId = {} satisfies Record<
    string,
    InspectorDrillLensTrigger[]
  >,
}: {
  sections?: InspectorSection[];
  cardsBySection?: Record<string, InspectorCard[]>;
  alertsByCardId?: Record<string, InspectorAlertTrigger[]>;
  drillLensesByCardId?: Record<string, InspectorDrillLensTrigger[]>;
} = {}) {
  const lensId = "lens-1";
  setupRunInspectorQueryEndpoint(
    1,
    lensId,
    createMockDataset({
      data: {
        rows: [[42]],
        cols: [createMockColumn({ name: "count" })],
      },
    }),
  );

  renderWithProviders(
    <LensContentProvider
      transform={createMockTransform()}
      lens={{
        id: lensId,
        display_name: "Test Lens",
        sections: [],
        cards: [],
      }}
      lensHandle={{ id: lensId }}
      alertsByCardId={alertsByCardId}
      drillLensesByCardId={drillLensesByCardId}
      collectedCardStats={{}}
      navigateToLens={jest.fn()}
      onStatsReady={jest.fn()}
      onCardStartedLoading={jest.fn()}
      onCardLoaded={jest.fn()}
    >
      <DefaultLensSections
        sections={sections}
        cardsBySection={cardsBySection}
        sources={[createMockTransformInspectSource()]}
      />
    </LensContentProvider>,
  );
}

describe("DefaultLensSections", () => {
  it("renders alerts for cards that have triggered alerts", () => {
    setup({
      alertsByCardId: {
        "card-1": [mockAlerts[0]],
        "card-2": [mockAlerts[1]],
      },
    });

    expect(
      screen.getByText("Row count dropped significantly"),
    ).toBeInTheDocument();
    expect(screen.getByText("Missing values detected")).toBeInTheDocument();
  });

  it("renders drill buttons for cards that have triggered drill lenses", () => {
    setup({
      drillLensesByCardId: {
        "card-1": [mockDrillLenses[0]],
        "card-2": [mockDrillLenses[1]],
      },
    });

    expect(screen.getByText(/missing values/)).toBeInTheDocument();
    expect(screen.getByText(/distribution anomaly/)).toBeInTheDocument();
  });
});
