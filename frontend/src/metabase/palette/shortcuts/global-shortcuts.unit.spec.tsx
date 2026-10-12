import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, waitFor } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Palette } from "metabase/palette/components/Palette";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

const PERSONAL_COLLECTION_ID = 42;

type SetupOpts = {
  isAdmin?: boolean;
};

const setup = async ({ isAdmin = true }: SetupOpts = {}) => {
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", can_write: true })],
  });

  const view = renderWithProviders(<Route path="*" element={<Palette />} />, {
    withKBar: true,
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({
        is_superuser: isAdmin,
        personal_collection_id: PERSONAL_COLLECTION_ID,
        permissions: createMockUserPermissions({
          can_create_queries: true,
          can_create_native_queries: true,
        }),
      }),
    }),
  });

  // The palette registers its actions from an effect fed by /api/search. A
  // keystroke dispatched before that registration lands is lost.
  await waitFor(() =>
    expect(fetchMock.callHistory.called("path:/api/search")).toBe(true),
  );

  return view;
};

describe("global keyboard shortcuts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("navigation", () => {
    it.each([
      ["g d", "gd", "/browse/databases"],
      ["g m", "gm", "/browse/models"],
      ["g k", "gk", "/browse/metrics"],
      ["g t", "gt", "/trash"],
      ["g u", "gu", "/account/profile"],
      ["g a", "ga", "/admin/settings"],
      ["g s", "gs", "/data-studio"],
      ["g p", "gp", `/collection/${PERSONAL_COLLECTION_ID}`],
    ])("%s navigates to %s", async (_name, keys, pathname) => {
      const { router } = await setup();

      await userEvent.keyboard(keys);

      await waitFor(() => expect(router?.location.pathname).toBe(pathname));
    });

    it("does not navigate to Data Studio for users without access", async () => {
      const { router } = await setup({ isAdmin: false });

      await userEvent.keyboard("gs");
      expect(router?.location.pathname).toBe("/");
      // Prove the keyboard pipeline is live for this user before asserting the
      // absence — otherwise the assertion passes for the wrong reason.
      await userEvent.keyboard("gt");

      await waitFor(() => expect(router?.location.pathname).toBe("/trash"));
    });

    it("does not navigate to admin settings for non-admins", async () => {
      const { router } = await setup({ isAdmin: false });

      await userEvent.keyboard("ga");
      expect(router?.location.pathname).toBe("/");
      await userEvent.keyboard("gt");

      await waitFor(() => expect(router?.location.pathname).toBe("/trash"));
    });
  });

  describe("creation", () => {
    it.each([
      ["c f", "cf", "collection"],
      ["c d", "cd", "dashboard"],
    ])("%s opens the %s modal", async (_name, keys, modalId) => {
      const { store } = await setup();

      await userEvent.keyboard(keys);

      await waitFor(() => expect(store.getState().modal.id).toBe(modalId));
    });
  });

  describe("suppression", () => {
    it("ignores shortcuts while a text input holds focus", async () => {
      const { router } = await setup();

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      await userEvent.keyboard("gt");
      expect(router?.location.pathname).toBe("/");

      input.remove();
      document.body.focus();

      await userEvent.keyboard("gt");
      await waitFor(() => expect(router?.location.pathname).toBe("/trash"));
    });
  });

  describe("analytics", () => {
    it("reports the shortcut that was performed", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      await setup();

      await userEvent.keyboard("gt");

      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "keyboard_shortcut_performed",
          event_detail: "navigate-trash",
        });
      });
    });
  });
});
