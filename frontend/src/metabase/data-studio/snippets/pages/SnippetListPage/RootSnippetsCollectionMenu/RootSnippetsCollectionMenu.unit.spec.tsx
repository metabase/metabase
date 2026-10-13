import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { dataStudioArchivedSnippets } from "metabase/urls";
import type { Collection, EnterpriseSettings } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";

function RootSnippetsCollectionMenuWithModal({
  collection,
}: {
  collection: Collection;
}) {
  const [modal, setModal] = useState<CollectionRowModalState>();
  return (
    <>
      <RootSnippetsCollectionMenu
        collection={collection}
        onOpenModal={setModal}
      />
      <CollectionRowModal modal={modal} onClose={() => setModal(undefined)} />
    </>
  );
}

interface SetupOptions {
  isEnterprise?: boolean;
  isSuperuser?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
}

const collection = createMockCollection({
  id: "root",
  name: "SQL Snippets",
  namespace: "snippets",
});

const setup = ({
  isEnterprise = true,
  isSuperuser = true,
  remoteSyncType,
}: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({
        snippet_collections: isEnterprise,
        remote_sync: !!remoteSyncType,
      }),
    }),
    currentUser: createMockUser({ is_superuser: isSuperuser }),
  });
  if (isEnterprise) {
    setupEnterpriseOnlyPlugin("snippets");
  }
  if (remoteSyncType) {
    setupEnterpriseOnlyPlugin("remote_sync");
  }
  setupCollectionsEndpoints({ collections: [collection] });
  setupGroupsEndpoint([]);
  setupCollectionPermissionsGraphEndpoint({ revision: 1, groups: {} });

  return renderWithProviders(
    <>
      <Route
        path="/"
        element={
          <RootSnippetsCollectionMenuWithModal collection={collection} />
        }
      />
      <Route
        path={dataStudioArchivedSnippets()}
        element={<div data-testid="archived-snippets" />}
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
    reinitialize();
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

  it("does not render 'change permissions' option without snippet folders", async () => {
    setup({ isEnterprise: false });

    await userEvent.click(
      screen.getByRole("button", { name: "Snippet collection options" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: /Change permissions/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /View archived snippets/ }),
    ).toBeInTheDocument();
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
      const { router } = setup();
      await userEvent.click(
        screen.getByRole("button", { name: "Snippet collection options" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: /View archived snippets/ }),
      );
      expect(router?.location?.pathname).toMatch(/\/snippets\/archived/);
    });
  });
});
