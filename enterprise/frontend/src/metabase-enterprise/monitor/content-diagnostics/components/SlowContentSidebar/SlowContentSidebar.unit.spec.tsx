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

  it("humanizes a duration spanning minutes", () => {
    setup(createMockContentDiagnosticsSlowFinding({ duration_ms: 65000 }));

    expect(screen.getByText("1m 5s")).toBeInTheDocument();
  });
});
