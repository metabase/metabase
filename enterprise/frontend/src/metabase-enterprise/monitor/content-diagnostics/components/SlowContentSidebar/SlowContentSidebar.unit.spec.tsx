import { renderWithProviders, screen } from "__support__/ui";
import type { ContentDiagnosticsSlowFinding } from "metabase-types/api";
import { createMockContentDiagnosticsSlowFinding } from "metabase-types/api/mocks";

import { SlowContentSidebar } from "./SlowContentSidebar";

function setup(
  finding: ContentDiagnosticsSlowFinding = createMockContentDiagnosticsSlowFinding(),
) {
  renderWithProviders(
    <SlowContentSidebar finding={finding} onClose={jest.fn()} />,
    { withRouter: true },
  );
}

describe("SlowContentSidebar", () => {
  it("renders the duration section", () => {
    setup(createMockContentDiagnosticsSlowFinding({ duration_ms: 5000 }));

    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("5.0s")).toBeInTheDocument();
  });

  it("links to the slow cards behind a container finding", () => {
    setup(
      createMockContentDiagnosticsSlowFinding({
        entity_type: "dashboard",
        details: {
          slow_entities: [
            {
              id: 33,
              name: "Slow report",
              entity_type: "card",
              card_type: "model",
              view_count: 7,
            },
          ],
        },
      }),
    );

    expect(
      screen.getByRole("region", { name: "Slow items" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Slow report" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/model\/33/),
    );
  });

  it("humanizes a duration spanning minutes", () => {
    setup(createMockContentDiagnosticsSlowFinding({ duration_ms: 65000 }));

    expect(screen.getByText("1m 5s")).toBeInTheDocument();
  });
});
