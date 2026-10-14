import { renderWithProviders, screen } from "__support__/ui";
import type { ContentDiagnosticsStaleFinding } from "metabase-types/api";
import { createMockContentDiagnosticsStaleFinding } from "metabase-types/api/mocks";

import { StaleContentSidebar } from "./StaleContentSidebar";

function setup(
  finding: ContentDiagnosticsStaleFinding = createMockContentDiagnosticsStaleFinding(),
) {
  renderWithProviders(
    <StaleContentSidebar finding={finding} onClose={jest.fn()} />,
    { withRouter: true },
  );
}

describe("StaleContentSidebar", () => {
  it("renders the last-activity section for a card", () => {
    setup(
      createMockContentDiagnosticsStaleFinding({
        entity_type: "card",
        last_active_at: "2026-03-01T00:00:00Z",
      }),
    );

    expect(screen.getByText("Last used")).toBeInTheDocument();
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
  });

  it("uses the entity-specific activity label for a dashboard", () => {
    setup(
      createMockContentDiagnosticsStaleFinding({ entity_type: "dashboard" }),
    );

    expect(screen.getByText("Last viewed")).toBeInTheDocument();
  });

  it("falls back to Never when there is no last activity", () => {
    setup(createMockContentDiagnosticsStaleFinding({ last_active_at: null }));

    expect(screen.getByText("Never")).toBeInTheDocument();
  });
});
