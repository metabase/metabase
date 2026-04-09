import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, EnterpriseSettings } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks/state";

import { SnippetCollectionMenu } from "./SnippetCollectionMenu";

interface SetupOptions {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  collection?: Partial<Collection>;
}

const onEditDetails = jest.fn();
const onChangePermissions = jest.fn();

const setup = ({ remoteSyncType, collection }: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
    }),
    currentUser: createMockUser(),
  });

  return renderWithProviders(
    <SnippetCollectionMenu
      collection={createMockCollection(collection)}
      onChangePermissions={onChangePermissions}
      onEditDetails={onEditDetails}
    />,
    {
      storeInitialState: state,
    },
  );
};

describe("RootSnippetsCollectionMenu", () => {
  it("renders snippet collection options menu", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Snippet folder options" }),
    ).toBeInTheDocument();
  });

  it("renders nothing if collection is not writable", () => {
    setup({ collection: { can_write: false } });
    expect(
      screen.queryByRole("button", { name: "Snippet folder options" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing if remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("button", { name: "Snippet folder options" }),
    ).not.toBeInTheDocument();
  });
});
