import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import type { RemoteSyncDependencyErrorResponse } from "metabase-types/api";
import { createMockCollectionItemFromCollection } from "metabase-types/api/mocks";

import { setup } from "./RemoteSyncSettingsForm.setup.spec";

const BLOCKED_COLLECTION = { id: 20, name: "Marketing" };
const REQUIRED_COLLECTION = { id: 30, name: "Finance" };

const createRefusal = (
  personal: boolean,
): RemoteSyncDependencyErrorResponse => ({
  error: "Uses content that is not remote synced.",
  error_code: "unsynced-dependencies",
  errors: {
    collections: [
      {
        collection: BLOCKED_COLLECTION,
        dependencies: [
          {
            model: "card",
            id: 416,
            name: "Seats over time",
            collection: REQUIRED_COLLECTION,
            remedy: {
              type: "collection",
              collection: { ...REQUIRED_COLLECTION, personal },
            },
          },
        ],
      },
    ],
  },
});

/**
 * Renders the admin form with two syncable collections, switches the blocked one on and saves. The
 * first save is refused with `body`; any retry succeeds, so the second PUT shows what the modal sent.
 */
const setupRefusedSave = async ({
  body = createRefusal(false),
}: { body?: RemoteSyncDependencyErrorResponse } = {}) => {
  setup({
    remoteSyncType: "read-write",
    remoteSyncUrl: "https://github.com/test/repo.git",
    remoteSyncEnabled: true,
    rootCollectionItems: [
      createMockCollectionItemFromCollection({
        ...BLOCKED_COLLECTION,
        is_remote_synced: false,
        can_write: true,
      }),
      createMockCollectionItemFromCollection({
        ...REQUIRED_COLLECTION,
        is_remote_synced: false,
        can_write: true,
      }),
    ],
  });

  let putCount = 0;
  fetchMock.removeRoute("remote-sync-settings");
  fetchMock.put(
    "path:/api/ee/remote-sync/settings",
    () => {
      putCount += 1;
      return putCount === 1 ? { status: 400, body } : { success: true };
    },
    { name: "remote-sync-settings" },
  );

  await waitFor(() => {
    expect(screen.getByLabelText("Read-write")).toBeChecked();
  });

  await userEvent.click(
    screen.getByLabelText(`Sync ${BLOCKED_COLLECTION.name}`),
  );
  await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));
};

const getSettingsPuts = async () => {
  const puts = await findRequests("PUT");
  return puts.filter((request) =>
    request.url.includes("/api/ee/remote-sync/settings"),
  );
};

describe("RemoteSyncDependencyModal", () => {
  it("opens when a save is refused, naming the collection that must be synced too", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/Couldn’t sync selected collection/),
    ).toBeInTheDocument();
    expect(
      within(modal).getByText(/rely on data saved elsewhere/),
    ).toBeInTheDocument();
    expect(
      within(modal).getByText(REQUIRED_COLLECTION.name),
    ).toBeInTheDocument();
  });

  it("stays closed until a save is refused", async () => {
    setup({
      remoteSyncType: "read-write",
      remoteSyncEnabled: true,
      remoteSyncUrl: "https://github.com/test/repo.git",
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Read-write")).toBeChecked();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches the required collections on and saves them in one action", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Sync required collections" }),
    );

    await waitFor(async () => {
      expect(await getSettingsPuts()).toHaveLength(2);
    });

    // The retry carries the collection the admin picked *and* the one the modal added — proof the
    // save reads the flipped form state rather than the values that were refused.
    const [, retry] = await getSettingsPuts();
    expect(retry.body).toHaveProperty("collections", {
      [BLOCKED_COLLECTION.id]: true,
      [REQUIRED_COLLECTION.id]: true,
    });
  });

  it("closes once the retry succeeds", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Sync required collections" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("stays closed after the admin dismisses it", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await getSettingsPuts()).toHaveLength(1);
  });

  it("offers no fix when the blocking content sits in a personal collection", async () => {
    await setupRefusedSave({ body: createRefusal(true) });

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/saved in a personal collection/),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByRole("button", {
        name: "Sync required collections",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: "Got it" }),
    ).toBeInTheDocument();
  });
});
