import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import type {
  RemoteSyncDependencyErrorResponse,
  RemoteSyncIneligibleDependency,
} from "metabase-types/api";
import { createMockCollectionItemFromCollection } from "metabase-types/api/mocks";

import { setup } from "./RemoteSyncSettingsForm.setup.spec";

const BLOCKED_COLLECTION = { id: 20, name: "Marketing" };
const REQUIRED_COLLECTION = { id: 30, name: "Finance" };

const SYNCABLE_DEPENDENCY: RemoteSyncIneligibleDependency = {
  model: "card",
  id: 416,
  name: "Seats over time",
  collection: REQUIRED_COLLECTION,
  remedy: {
    type: "collection",
    collection: { ...REQUIRED_COLLECTION, personal: false },
  },
  used_by: [],
};

const PERSONAL_DEPENDENCY: RemoteSyncIneligibleDependency = {
  model: "card",
  id: 417,
  name: "Draft",
  collection: REQUIRED_COLLECTION,
  remedy: {
    type: "collection",
    collection: { id: 5, name: "Nick's stuff", personal: true },
  },
  used_by: [],
};

// `collection: null` is the root collection
const ROOT_DEPENDENCY: RemoteSyncIneligibleDependency = {
  model: "card",
  id: 512,
  name: "Orphaned",
  collection: null,
  remedy: { type: "none" },
  used_by: [],
};

// The backend sends no id for the Library, so there is nothing to switch on.
const SNIPPET_DEPENDENCY: RemoteSyncIneligibleDependency = {
  model: "snippet",
  id: 3,
  name: "active_users",
  remedy: { type: "library" },
  used_by: [],
};

const createRefusal = (
  ...dependencies: RemoteSyncIneligibleDependency[]
): RemoteSyncDependencyErrorResponse => ({
  error: "Uses content that is not remote synced.",
  error_code: "unsynced-dependencies",
  errors: {
    collections: [{ collection: BLOCKED_COLLECTION, dependencies }],
  },
});

// First save is refused with `body`; any retry succeeds, so the second PUT shows what the modal sent.
const setupRefusedSave = async ({
  body = createRefusal(SYNCABLE_DEPENDENCY),
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

// The modal asks a question when it can act, and reports a failure when it can't.
const expectFixOffered = (modal: HTMLElement) => {
  expect(
    within(modal).getByText("Sync collections with dependencies?"),
  ).toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: "Sync required collections" }),
  ).toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: "Cancel" }),
  ).toBeInTheDocument();
};

const expectNoFixOffered = (modal: HTMLElement) => {
  expect(
    within(modal).getByText(/Couldn.t sync selected collection/),
  ).toBeInTheDocument();
  expect(
    within(modal).queryByRole("button", { name: "Sync required collections" }),
  ).not.toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: "Back" }),
  ).toBeInTheDocument();
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
    expectFixOffered(modal);
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
    await setupRefusedSave({ body: createRefusal(PERSONAL_DEPENDENCY) });

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/saved in a personal collection/),
    ).toBeInTheDocument();
    expectNoFixOffered(modal);
  });

  it("offers no fix when the blocking content sits in the root collection", async () => {
    await setupRefusedSave({ body: createRefusal(ROOT_DEPENDENCY) });

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/can.t be synced where it currently lives/),
    ).toBeInTheDocument();
    expectNoFixOffered(modal);
  });

  it("lists Our analytics as unsyncable, rather than leaving the list empty", async () => {
    await setupRefusedSave({
      body: createRefusal(SYNCABLE_DEPENDENCY, ROOT_DEPENDENCY),
    });

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Our analytics")).toBeInTheDocument();
    // The syncable remedy is still listed, but nothing here is actionable while the root one stands.
    expect(
      within(modal).getByText(REQUIRED_COLLECTION.name),
    ).toBeInTheDocument();
    expect(within(modal).getByText("Can't be synced")).toBeInTheDocument();
  });

  it("offers no fix when the dependency is a snippet, since the Library has no id to switch on", async () => {
    await setupRefusedSave({ body: createRefusal(SNIPPET_DEPENDENCY) });

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/sync with the Library/),
    ).toBeInTheDocument();
    expectNoFixOffered(modal);
  });

  it("keeps the admin's selection after a refused save, so it can be retried", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Cancel" }),
    );

    // A refused save rolls back, so the collection list refetch it triggers must not reset the form.
    await waitFor(async () => {
      expect(await findRequests("GET")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: expect.stringContaining("/api/collection/root/items"),
          }),
        ]),
      );
    });

    expect(
      screen.getByLabelText(`Sync ${BLOCKED_COLLECTION.name}`),
    ).toBeChecked();
    // Enabled means still dirty; the button relabels to "Failed" after a rejected submit.
    expect(screen.getByTestId("remote-sync-submit-button")).toBeEnabled();
  });

  // Switching Finance on would leave the other dependency behind, so the save is refused again.
  it.each([
    ["personal", PERSONAL_DEPENDENCY],
    ["root", ROOT_DEPENDENCY],
    ["snippet", SNIPPET_DEPENDENCY],
  ])(
    "offers no fix when a syncable dependency is joined by a %s one",
    async (_label, dependency) => {
      await setupRefusedSave({
        body: createRefusal(SYNCABLE_DEPENDENCY, dependency),
      });

      expectNoFixOffered(await screen.findByRole("dialog"));
    },
  );
});
