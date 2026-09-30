import {
  createMockAdminState,
  createMockPermissionsState,
  createMockState,
} from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";

import { PermissionsPageLayout } from "./PermissionsPageLayout";

type SetupOpts = {
  isHelpReferenceOpen?: boolean;
};

const setup = ({ isHelpReferenceOpen = true }: SetupOpts = {}) => {
  renderWithProviders(
    <PermissionsPageLayout tab="data" helpContent={<div>{"Help content"}</div>}>
      <div>{"Permissions editor"}</div>
    </PermissionsPageLayout>,
    {
      withRouter: true,
      storeInitialState: createMockState({
        admin: createMockAdminState({
          permissions: createMockPermissionsState({ isHelpReferenceOpen }),
        }),
      }),
    },
  );
};

describe("PermissionsPageLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the help reference in a resizable panel at the medium width", () => {
    setup();

    const panel = screen.getByTestId("resizable-side-panel");
    expect(panel).toHaveStyle({ width: "320px" });
    expect(
      within(panel).getByLabelText("Permissions help reference"),
    ).toHaveTextContent("Help content");
  });

  it("opens the help reference at the width the user last resized it to", () => {
    setStoredSidePanelWidth("admin-permissions-help", 300);

    setup();

    expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
      width: "300px",
    });
  });

  it("has no help panel while the help reference is closed", () => {
    setup({ isHelpReferenceOpen: false });

    expect(screen.getByText("Permissions editor")).toBeInTheDocument();
    expect(
      screen.queryByTestId("resizable-side-panel"),
    ).not.toBeInTheDocument();
  });
});
