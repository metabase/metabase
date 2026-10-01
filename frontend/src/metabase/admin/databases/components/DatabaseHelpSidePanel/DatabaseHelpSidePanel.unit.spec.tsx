import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { setStoredSidePanelWidth } from "metabase/common/components/ResizableSidePanel";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { Route } from "metabase/router";
import type { EngineKey } from "metabase-types/api";
import {
  createMockEngines,
  createMockGroup,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseHelpSidePanel } from "./DatabaseHelpSidePanel";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres MD Content",
);

jest.mock("metabase/common/hooks/use-is-small-screen", () => ({
  useIsSmallScreen: jest.fn(() => false),
}));

interface SetupOptions {
  onClose?: VoidFunction;
  engineKey?: EngineKey;
  paidPlan?: boolean;
  showMetabaseLinks?: boolean;
  isAdmin?: boolean;
}

const setup = (opts: SetupOptions) => {
  const {
    onClose = jest.fn(),
    engineKey = "postgres",
    paidPlan = true,
    showMetabaseLinks = true,
    isAdmin = true,
  } = opts;
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-status": paidPlan
        ? createMockTokenStatus({
            valid: true,
          })
        : undefined,
      "token-features": createMockTokenFeatures({ whitelabel: true }),
      "is-hosted?": true,
      engines: createMockEngines(),
    }),
  });
  setupEnterprisePlugins();

  renderWithProviders(
    <Route
      element={
        <DatabaseHelpSidePanel engineKey={engineKey} onClose={onClose} />
      }
      path="/"
    />,
    {
      withRouter: true,
      storeInitialState,
    },
  );
};

describe("DatabaseHelpSidePanel", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.mocked(useIsSmallScreen).mockReturnValue(false);
  });

  describe("resizing", () => {
    it("is resizable at the large width on larger screens", async () => {
      await act(async () => {
        setup({});
      });

      const panel = screen.getByTestId("resizable-side-panel");
      expect(panel).toHaveStyle({ width: "400px" });
      expect(
        within(panel).getByTestId("database-help-side-panel"),
      ).toBeInTheDocument();
    });

    it("opens at the width the user last resized it to", async () => {
      setStoredSidePanelWidth("admin-database-help", 460);

      await act(async () => {
        setup({});
      });

      expect(screen.getByTestId("resizable-side-panel")).toHaveStyle({
        width: "460px",
      });
    });

    it("is not resizable on small screens", async () => {
      jest.mocked(useIsSmallScreen).mockReturnValue(true);

      await act(async () => {
        setup({});
      });

      expect(
        screen.getByTestId("database-help-side-panel"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("resizable-side-panel"),
      ).not.toBeInTheDocument();
    });
  });

  it("should render help links and the engine md content", async () => {
    await act(async () => {
      setup({});
    });
    expect(
      screen.getByRole("link", { name: /Read the full docs/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Invite a teammate to help you/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Talk to an expert/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Postgres MD Content/)).toBeInTheDocument();
  });

  it("should not render invite user button if not an admin", async () => {
    await act(async () => {
      setup({ isAdmin: false });
    });

    expect(
      screen.queryByRole("button", { name: /Invite a teammate to help you/ }),
    ).not.toBeInTheDocument();
  });

  it("should not render links if showMetabaseLinks is false", async () => {
    await act(async () => {
      setup({ showMetabaseLinks: false });
    });

    expect(
      screen.queryByRole("link", { name: /Read the full docs/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Talk to an expert/ }),
    ).not.toBeInTheDocument();
  });

  it("should not render 'Talk to an expert' link if not in a paid plan", async () => {
    await act(async () => {
      setup({ paidPlan: false });
    });

    expect(
      screen.queryByRole("link", { name: /Talk to an expert/ }),
    ).not.toBeInTheDocument();
  });

  it("should call onClose prop when close button is clicked", async () => {
    const onClose = jest.fn();
    await act(async () => {
      setup({ onClose });
    });

    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("img", { name: "close icon" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should render 'new user' modal when 'Invite a teammate...' button is clicked", async () => {
    fetchMock.get("path:/api/permissions/group", [createMockGroup()]);
    await act(async () => {
      setup({ isAdmin: true });
    });
    await userEvent.click(
      screen.getByRole("button", { name: /Invite a teammate to help you/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: /Create user/ }),
    ).toBeInTheDocument();
  });
});
