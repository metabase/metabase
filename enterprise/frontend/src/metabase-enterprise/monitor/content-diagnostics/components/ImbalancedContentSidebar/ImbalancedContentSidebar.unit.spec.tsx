import { renderWithProviders, screen } from "__support__/ui";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedUnit,
} from "metabase-types/api";
import { createMockContentDiagnosticsImbalancedFinding } from "metabase-types/api/mocks";

import { ImbalancedContentSidebar } from "./ImbalancedContentSidebar";

function setup(
  finding: ContentDiagnosticsImbalancedFinding = createMockContentDiagnosticsImbalancedFinding(),
  tab: "empty" | "sparse" | "crowded" = "empty",
) {
  renderWithProviders(
    <ImbalancedContentSidebar
      finding={finding}
      tab={tab}
      onClose={jest.fn()}
    />,
    { withRouter: true },
  );
}

describe("ImbalancedContentSidebar", () => {
  it("renders the content count section", () => {
    setup(
      createMockContentDiagnosticsImbalancedFinding({
        content_count: 101,
        details: { unit: "items" },
      }),
    );

    expect(screen.getByText("Content count")).toBeInTheDocument();
    expect(screen.getByText("101 items")).toBeInTheDocument();
  });

  it("uses the unit the finding was measured in", () => {
    setup(
      createMockContentDiagnosticsImbalancedFinding({
        finding_type: "crowded",
        entity_type: "dashboard",
        content_count: 21,
        details: { unit: "dashcards" },
      }),
      "crowded",
    );

    expect(screen.getByText("21 dashcards on one tab")).toBeInTheDocument();
  });

  it.each<{
    scenario: string;
    tab: ContentDiagnosticsImbalancedFindingType;
    entityType: ContentDiagnosticsImbalancedFinding["entity_type"];
    count: number;
    unit: ContentDiagnosticsImbalancedUnit;
    expected: string;
  }>([
    {
      scenario: "CR-2 crowded collection",
      tab: "crowded",
      entityType: "collection",
      count: 3,
      unit: "items",
      expected: "3 items",
    },
    {
      scenario: "CR-2 packed dashboard",
      tab: "crowded",
      entityType: "dashboard",
      count: 2,
      unit: "dashcards",
      expected: "2 dashcards on one tab",
    },
    {
      scenario: "CR-2/OV-1 tabbed dashboard",
      tab: "crowded",
      entityType: "dashboard",
      count: 2,
      unit: "tabs",
      expected: "2 tabs",
    },
    {
      scenario: "CR-2 crowded document",
      tab: "crowded",
      entityType: "document",
      count: 2,
      unit: "cards",
      expected: "2 cards",
    },
    {
      scenario: "EM-2 empty collection",
      tab: "empty",
      entityType: "collection",
      count: 0,
      unit: "items",
      expected: "0 items",
    },
    {
      scenario: "EM-2/OV-2 empty dashboard",
      tab: "empty",
      entityType: "dashboard",
      count: 0,
      unit: "dashcards",
      expected: "0 dashcards",
    },
    {
      scenario: "EM-2 empty document",
      tab: "empty",
      entityType: "document",
      count: 0,
      unit: "cards",
      expected: "0 cards",
    },
    {
      scenario: "EM-2 empty native question",
      tab: "empty",
      entityType: "card",
      count: 0,
      unit: "rows",
      expected: "0 rows",
    },
    {
      scenario: "SP-3 sparse collection",
      tab: "sparse",
      entityType: "collection",
      count: 2,
      unit: "items",
      expected: "2 items",
    },
    {
      scenario: "SP-3 sparse dashboard",
      tab: "sparse",
      entityType: "dashboard",
      count: 1,
      unit: "dashcards",
      expected: "1 dashcard",
    },
  ])(
    "$scenario shows the content count as '$expected'",
    ({ tab, entityType, count, unit, expected }) => {
      setup(
        createMockContentDiagnosticsImbalancedFinding({
          finding_type: tab,
          entity_type: entityType,
          content_count: count,
          details: { unit },
        }),
        tab,
      );

      expect(screen.getByText("Content count")).toBeInTheDocument();
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );
});
