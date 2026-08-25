import { renderWithProviders, screen } from "__support__/ui";
import type { ContentDiagnosticsImbalancedFinding } from "metabase-types/api";
import { createMockContentDiagnosticsImbalancedFinding } from "metabase-types/api/mocks";

import { ImbalancedContentSidebar } from "./ImbalancedContentSidebar";

function setup(
  finding: ContentDiagnosticsImbalancedFinding = createMockContentDiagnosticsImbalancedFinding(),
) {
  renderWithProviders(
    <ImbalancedContentSidebar finding={finding} onClose={jest.fn()} />,
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
    );

    expect(screen.getByText("21 dashcards")).toBeInTheDocument();
  });
});
