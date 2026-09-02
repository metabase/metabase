import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { ContentDiagnosticsStaleFinding } from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsStaleFinding,
  createMockContentDiagnosticsUser,
} from "metabase-types/api/mocks";

import {
  DiagnosticsSidebar,
  type SidebarExtraInfo,
} from "./DiagnosticsSidebar";

type SetupOpts = {
  finding?: ContentDiagnosticsStaleFinding;
  extraInfo?: SidebarExtraInfo;
};

function setup({
  finding = createMockContentDiagnosticsStaleFinding(),
  extraInfo = { label: "Last used", children: "3 months ago" },
}: SetupOpts = {}) {
  const onClose = jest.fn();

  renderWithProviders(
    <DiagnosticsSidebar
      finding={finding}
      extraInfo={extraInfo}
      onClose={onClose}
    />,
    { withRouter: true },
  );

  return { onClose };
}

describe("DiagnosticsSidebar", () => {
  it("renders the entity name and type", () => {
    setup({
      finding: createMockContentDiagnosticsStaleFinding({
        entity_type: "card",
        entity_display_name: "Sales overview",
      }),
    });

    expect(
      screen.getByRole("region", { name: "Details for Sales overview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(screen.getByText("Question")).toBeInTheDocument();
  });

  it("renders the creator and view count", () => {
    setup({
      finding: createMockContentDiagnosticsStaleFinding({
        details: {
          creator: createMockContentDiagnosticsUser({ name: "Ada Lovelace" }),
          view_count: 42,
        },
      }),
    });

    expect(screen.getByText("Created by")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Views")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders the location breadcrumb", () => {
    setup({
      finding: createMockContentDiagnosticsStaleFinding({
        details: {
          collection: createMockContentDiagnosticsCollection({
            name: "Marketing",
          }),
        },
      }),
    });

    const location = screen.getByRole("region", { name: "Location" });
    expect(within(location).getByText("Marketing")).toBeInTheDocument();
  });

  it("shows a fallback when there is no description", () => {
    setup({
      finding: createMockContentDiagnosticsStaleFinding({
        details: { description: null },
      }),
    });

    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("omits the owner row when there is no owner", () => {
    setup({
      finding: createMockContentDiagnosticsStaleFinding({
        details: { owner: null },
      }),
    });

    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("renders the extra info slot after the built-in fields", () => {
    setup({ extraInfo: { label: "Last run", children: "Yesterday" } });

    expect(screen.getByText("Last run")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
