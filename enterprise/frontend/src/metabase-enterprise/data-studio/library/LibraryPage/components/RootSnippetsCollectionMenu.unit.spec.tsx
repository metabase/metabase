import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks/state";
import { dataStudioArchivedSnippets } from "metabase/urls";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

interface SetupOptions {
  isSuperuser?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
}

const collection = createMockCollection({ id: "root", name: "SQL Snippets" });

const setup = ({ isSuperuser = true, remoteSyncType }: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({ snippet_collections: true }),
    }),
    currentUser: createMockUser({ is_superuser: isSuperuser }),
  });
  setupEnterpriseOnlyPlugin("snippets");
  setupCollectionsEndpoints({ collections: [collection] });
  setupGroupsEndpoint([]);
  setupCollectionPermissionsGraphEndpoint({ revision: 1, groups: {} });

  return renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <RootSnippetsCollectionMenu collectionId={collection.id} />
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

    it("shows permissions modal on click", async () => {
      setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Snippet collection options" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Change permissions/ }),
      );
      expect(
        await within(screen.getByRole("dialog")).findByRole("heading", {
          name: /Permissions for SQL Snippets/,
        }),
      ).toBeInTheDocument();
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
