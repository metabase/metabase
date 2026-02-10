import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
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
    <RootSnippetsCollectionMenu
      setPermissionsCollectionId={setPermissionsCollectionId}
    />,
    {
      storeInitialState: state,
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

  it("renders nothing if user is not a superuser", () => {
    setup({ isSuperuser: false });
    expect(
      screen.queryByRole("button", { name: "Snippet collection options" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing if remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("button", { name: "Snippet collection options" }),
    ).not.toBeInTheDocument();
  });

  describe("show permissions options", () => {
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
});
