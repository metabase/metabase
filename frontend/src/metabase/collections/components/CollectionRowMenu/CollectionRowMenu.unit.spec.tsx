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
  onChangePermissions?: () => void;
}

const setup = ({
  remoteSyncType,
  collection,
  onChangePermissions,
}: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
    currentUser: createMockUser({ is_superuser: true }),
  });
  setupEnterpriseOnlyPlugin("remote_sync");

  return renderWithProviders(
    <CollectionRowMenu
      collection={createMockCollection(collection)}
      onChangePermissions={onChangePermissions}
    />,
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
    expect(queryMenuItem(/Change permissions/)).not.toBeInTheDocument();
  });

  it("does not render archive and edit options when collection is root", async () => {
    setup({ collection: { id: "root" } });
    await openMenu();
    expect(queryMenuItem(/Archive/)).not.toBeInTheDocument();
    expect(queryMenuItem(/Edit collection details/)).not.toBeInTheDocument();
  });

  it("renders the change permissions item when onChangePermissions is set", async () => {
    setup({ onChangePermissions: jest.fn() });
    await openMenu();
    expect(getMenuItem(/Change permissions/)).toBeInTheDocument();
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
