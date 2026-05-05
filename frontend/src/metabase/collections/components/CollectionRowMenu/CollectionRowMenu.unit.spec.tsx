import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { Collection, EnterpriseSettings } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { CollectionRowMenu } from "./CollectionRowMenu";

interface SetupOptions {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  collection?: Partial<Collection>;
  isAdmin?: boolean;
}

const setup = ({
  remoteSyncType,
  collection,
  isAdmin = true,
}: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({
        library: true,
        remote_sync: true,
      }),
    }),
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });
  setupEnterpriseOnlyPlugin("library");
  setupEnterpriseOnlyPlugin("remote_sync");

  return renderWithProviders(
    <CollectionRowMenu collection={createMockCollection(collection)} />,
    {
      storeInitialState: state,
    },
  );
};

describe("CollectionRowMenu", () => {
  it("renders collection options menu", async () => {
    setup();
    await openMenu();
    expect(getMenuItem(/Archive/)).toBeInTheDocument();
    expect(getMenuItem(/Edit collection details/)).toBeInTheDocument();
    expect(getMenuItem(/Change permissions/)).toBeInTheDocument();
  });

  it("does not render archive and edit options when collection is root", async () => {
    setup({ collection: { id: "root" } });
    await openMenu();
    expect(queryMenuItem(/Archive/)).not.toBeInTheDocument();
    expect(queryMenuItem(/Edit collection details/)).not.toBeInTheDocument();
  });

  it("does not render the change permissions item for non-admins", async () => {
    setup({ isAdmin: false });
    await openMenu();
    expect(queryMenuItem(/Change permissions/)).not.toBeInTheDocument();
  });

  it("renders nothing if collection is not writable", () => {
    setup({ collection: { can_write: false } });
    expect(
      screen.queryByRole("button", { name: "Collection options" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing if remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("button", { name: "Collection options" }),
    ).not.toBeInTheDocument();
  });
});

const openMenu = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Collection options" }),
  );
};
const getMenuItem = (name: RegExp) => screen.getByRole("menuitem", { name });
const queryMenuItem = (name: RegExp) =>
  screen.queryByRole("menuitem", { name });
