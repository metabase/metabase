import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { dataStudioArchivedSnippets } from "metabase/lib/urls";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks/state";

import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

interface SetupOptions {
  isSuperuser?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
}

const setPermissionsCollectionId = jest.fn();

const setup = ({ isSuperuser = true, remoteSyncType }: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
    }),
    currentUser: createMockUser({ is_superuser: isSuperuser }),
  });
  return renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <RootSnippetsCollectionMenu
            setPermissionsCollectionId={setPermissionsCollectionId}
          />
        )}
      />
      <Route
        path={dataStudioArchivedSnippets()}
        component={() => <div data-testid="archived-snippets" />}
      />
    </>,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );
};

describe("RootSnippetsCollectionMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders snippets options menu", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Snippet collection options" }),
    ).toBeInTheDocument();
  });

  it("does not render 'change permissions' option if user is not a superuser", async () => {
    setup({ isSuperuser: false });

    await userEvent.click(
      screen.getByRole("button", { name: "Snippet collection options" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: /Change permissions/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render 'change permissions' option if remote sync is set to read-only", async () => {
    setup({ remoteSyncType: "read-only" });

    await userEvent.click(
      screen.getByRole("button", { name: "Snippet collection options" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: /Change permissions/ }),
    ).not.toBeInTheDocument();
  });

  describe("show permissions option", () => {
    it("is rendered on menu click", async () => {
      setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Snippet collection options" }),
      );
      expect(
        screen.getByRole("menuitem", { name: /Change permissions/ }),
      ).toBeInTheDocument();
    });

    it("calls setPermissionsCollectionId on click", async () => {
      setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Snippet collection options" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Change permissions/ }),
      );
      expect(setPermissionsCollectionId).toHaveBeenCalledWith("root");
    });
  });

  describe("view archived snippets option", () => {
    it("navigates to archived snippets page", async () => {
      const { history } = setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Snippet collection options" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: /View archived snippets/ }),
      );
      expect(history?.getCurrentLocation()?.pathname).toMatch(
        /\/snippets\/archived/,
      );
    });
  });
});
