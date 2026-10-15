import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Dashboard, Document } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDocument,
} from "metabase-types/api/mocks";

import { TRASHED_FOLDER } from "../../test-utils";

import { LibraryArchivedBanner } from "./LibraryArchivedBanner";

const ITEM_ID = 10;

type SetupOpts = {
  model: "dashboard" | "document";
  isRemoteSyncReadOnly?: boolean;
  isTrashedWithFolder?: boolean;
};

function setup({
  model,
  isRemoteSyncReadOnly = false,
  isTrashedWithFolder = false,
}: SetupOpts) {
  const trashedItem: Partial<Dashboard & Document> = {
    id: ITEM_ID,
    archived: true,
    can_write: true,
    can_delete: true,
    ...(isTrashedWithFolder
      ? {
          archived_directly: false,
          can_restore: false,
          collection: TRASHED_FOLDER,
        }
      : { archived_directly: true, can_restore: true }),
  };
  fetchMock.put(`path:/api/${model}/${ITEM_ID}`, { id: ITEM_ID });
  fetchMock.delete(`path:/api/${model}/${ITEM_ID}`, {});

  const settings = mockSettings({
    "remote-sync-enabled": isRemoteSyncReadOnly,
    "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : undefined,
  });

  return renderWithProviders(
    <Route
      path="*"
      element={
        model === "dashboard" ? (
          <LibraryArchivedBanner
            model="dashboard"
            item={createMockDashboard(trashedItem)}
          />
        ) : (
          <LibraryArchivedBanner
            model="document"
            item={createMockDocument(trashedItem)}
          />
        )
      }
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `/data-studio/${model}s/${ITEM_ID}`,
      storeInitialState: createMockState({ settings }),
    },
  );
}

describe("LibraryArchivedBanner", () => {
  it.each([
    { model: "dashboard" as const, restoreBody: { archived: false } },
    {
      model: "document" as const,
      restoreBody: { id: ITEM_ID, archived: false },
    },
  ])("restores a $model from the trash", async ({ model, restoreBody }) => {
    setup({ model });

    await userEvent.click(
      within(screen.getByTestId("archive-banner")).getByText("Restore"),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory
          .calls(`path:/api/${model}/${ITEM_ID}`, { method: "PUT" })
          .map((call): unknown => JSON.parse(String(call.options.body))),
      ).toEqual([restoreBody]),
    );
  });

  it.each([
    { model: "dashboard" as const, sectionUrl: "/data-studio/dashboards" },
    { model: "document" as const, sectionUrl: "/data-studio/documents" },
  ])(
    "deletes a $model permanently and goes to $sectionUrl",
    async ({ model, sectionUrl }) => {
      const { router } = setup({ model });

      const banner = screen.getByTestId("archive-banner");
      expect(banner).toHaveTextContent(`This ${model} is in the trash.`);
      await userEvent.click(within(banner).getByText("Delete permanently"));
      await userEvent.click(
        within(screen.getByTestId("delete-confirmation")).getByRole("button", {
          name: "Delete permanently",
        }),
      );

      await waitFor(() => expect(router?.location.pathname).toBe(sectionUrl));
      expect(
        fetchMock.callHistory.called(`path:/api/${model}/${ITEM_ID}`, {
          method: "DELETE",
        }),
      ).toBe(true);
      expect(
        await screen.findByText("This item has been permanently deleted."),
      ).toBeInTheDocument();
    },
  );

  it.each([{ model: "dashboard" as const }, { model: "document" as const }])(
    "names and links the trashed folder of a $model trashed along with it, and offers no Restore",
    ({ model }) => {
      setup({ model, isTrashedWithFolder: true });

      const banner = screen.getByTestId("archive-banner");
      expect(banner).toHaveTextContent(
        `This ${model} is in the trash because its folder Old reports is.`,
      );
      expect(
        within(banner).getByRole("link", { name: "Old reports" }),
      ).toHaveAttribute("href", `/collection/${TRASHED_FOLDER.id}-old-reports`);
      expect(within(banner).queryByText("Restore")).not.toBeInTheDocument();
      expect(within(banner).getByText("Move")).toBeInTheDocument();
      expect(
        within(banner).getByText("Delete permanently"),
      ).toBeInTheDocument();
    },
  );

  it("hides the actions when remote sync is read-only", () => {
    setup({ model: "document", isRemoteSyncReadOnly: true });

    const banner = screen.getByTestId("archive-banner");
    expect(banner).toHaveTextContent("This document is in the trash.");
    expect(within(banner).queryByRole("button")).not.toBeInTheDocument();
  });
});
