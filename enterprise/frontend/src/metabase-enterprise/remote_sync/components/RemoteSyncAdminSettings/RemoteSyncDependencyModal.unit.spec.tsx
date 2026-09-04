import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import type {
  RemoteSyncDependencyErrorResponse,
  RemoteSyncIneligibleDependency,
  RemoteSyncRequiredSync,
} from "metabase-types/api";
import { createMockCollectionItemFromCollection } from "metabase-types/api/mocks";

import { setup } from "./RemoteSyncSettingsForm.setup.spec";

const BLOCKED_COLLECTION = { id: 20, name: "Marketing" };
const REQUIRED_COLLECTION = { id: 30, name: "Finance" };

// `used_by` is what an expanded row lists as the dependent; `display` picks the visualization icon.
const SYNCABLE_DEPENDENCY: RemoteSyncIneligibleDependency = {
  model: "card",
  id: 416,
  name: "Seats over time",
  collection: REQUIRED_COLLECTION,
  display: "bar",
  used_by: [{ model: "dashboard", id: 7, name: "Q3 Review" }],
};

const requiredSync = (
  remedy: RemoteSyncRequiredSync["remedy"],
  syncable = false,
  dependencies = [SYNCABLE_DEPENDENCY],
): RemoteSyncRequiredSync => ({
  remedy,
  syncable,
  blocks: [BLOCKED_COLLECTION],
  dependencies,
});

const SYNCABLE_REQUIRED = requiredSync(
  {
    type: "collection",
    collection: { ...REQUIRED_COLLECTION, type: null, personal: false },
  },
  true,
);

const PERSONAL_REQUIRED = requiredSync({
  type: "collection",
  collection: { id: 5, name: "Nick's stuff", type: null, personal: true },
});

// `collection: null` is the root collection
const ROOT_REQUIRED = requiredSync({ type: "none", collection: null });

// The Library is an ordinary collection, so a snippet points at it like any other remedy.
const LIBRARY_COLLECTION = { id: 2, name: "Library" };
const LIBRARY_REQUIRED = requiredSync(
  {
    type: "collection",
    collection: { ...LIBRARY_COLLECTION, type: "library", personal: false },
  },
  true,
  [{ model: "snippet", id: 3, name: "active_users", used_by: [] }],
);

// ...unless the instance has no Library yet, leaving nothing to switch on.
const LIBRARY_MISSING_REQUIRED = requiredSync({ type: "library" }, false, [
  { model: "snippet", id: 4, name: "monthly_cutoff", used_by: [] },
]);

const createRefusal = (
  ...required: RemoteSyncRequiredSync[]
): RemoteSyncDependencyErrorResponse => ({
  error: "Uses content that is not remote synced.",
  error_code: "unsynced-dependencies",
  errors: { required },
});

// The first save is refused with `body`; later ones succeed unless `refuseRetry`, so the second PUT
// shows what the modal staged.
const setupRefusedSave = async ({
  body = createRefusal(SYNCABLE_REQUIRED),
  refuseRetry = false,
}: {
  body?: RemoteSyncDependencyErrorResponse;
  refuseRetry?: boolean;
} = {}) => {
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
      return putCount === 1 || refuseRetry
        ? { status: 400, body }
        : { success: true };
    },
    { name: "remote-sync-settings" },
  );

  await waitFor(() => {
    expect(screen.getByLabelText("Read-write")).toBeChecked();
  });

  await userEvent.click(
    screen.getByLabelText(`Sync ${BLOCKED_COLLECTION.name}`),
  );
  await save();
};

// By test id, not label: the button reads "Failed" for several seconds after a rejected submit.
const save = () =>
  userEvent.click(screen.getByTestId("remote-sync-submit-button"));

const dismiss = (modal: HTMLElement) =>
  userEvent.click(within(modal).getByRole("button", { name: "Close" }));

const expectClosed = () =>
  waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

const getSettingsPuts = async () => {
  const puts = await findRequests("PUT");
  return puts.filter((request) =>
    request.url.includes("/api/ee/remote-sync/settings"),
  );
};

describe("RemoteSyncDependencyModal", () => {
  it("opens when a save is refused, offering the collection that must be synced too", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/Couldn.t sync selected collection/),
    ).toBeInTheDocument();
    expect(
      within(modal).getByText(/rely on data saved elsewhere/),
    ).toBeInTheDocument();
    expect(
      within(modal).getByLabelText(`Sync ${REQUIRED_COLLECTION.name}`),
    ).not.toBeChecked();
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

  it("stays dismissed until a later save is refused again", async () => {
    await setupRefusedSave({ refuseRetry: true });

    await dismiss(await screen.findByRole("dialog"));
    await expectClosed();
    // Dismissing is not itself a save.
    expect(await getSettingsPuts()).toHaveLength(1);

    // A fresh refusal is a new error object, which is what separates it from the dismissed one.
    await save();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("expands a collection to list the blocked content and what depends on it", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    // Not an exact name: the decorative collection icon contributes its own label to the control.
    const row = within(modal).getByRole("button", {
      name: new RegExp(REQUIRED_COLLECTION.name),
    });
    expect(row).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(row);

    // `aria-expanded` is the assertion, not the panel's presence: Mantine keeps a collapsed panel
    // mounted, so its content is in the DOM either way.
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(
      within(modal).getByText(SYNCABLE_DEPENDENCY.name),
    ).toBeInTheDocument();
    expect(within(modal).getByText("Q3 Review")).toBeInTheDocument();
  });

  it("carries a collection switched on in the modal into the next save", async () => {
    await setupRefusedSave();

    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByLabelText(`Sync ${REQUIRED_COLLECTION.name}`),
    );
    await dismiss(modal);
    await save();

    await waitFor(async () => {
      expect(await getSettingsPuts()).toHaveLength(2);
    });

    // The retry carries the collection the admin picked *and* the one switched on in the modal —
    // proof the save reads the flipped form state rather than the values that were refused.
    const [, retry] = await getSettingsPuts();
    expect(retry.body).toHaveProperty("collections", {
      [BLOCKED_COLLECTION.id]: true,
      [REQUIRED_COLLECTION.id]: true,
    });
  });

  it("keeps the admin's selection after a refused save, so it can be retried", async () => {
    await setupRefusedSave();

    await dismiss(await screen.findByRole("dialog"));

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

  // Finance keeps its switch even though the other dependency will refuse the save again — a
  // partial fix is progress the admin can combine with moving the rest.
  it.each([
    [
      "personal",
      PERSONAL_REQUIRED,
      "Nick's stuff",
      /saved in a personal collection/,
    ],
    [
      "root",
      ROOT_REQUIRED,
      "Our analytics",
      /can.t be synced where it currently lives/,
    ],
  ])(
    "explains a %s blocker and lists it beside the collection that can be switched on",
    async (_label, requiredEntry, unsyncableName, message) => {
      await setupRefusedSave({
        body: createRefusal(SYNCABLE_REQUIRED, requiredEntry),
      });

      const modal = await screen.findByRole("dialog");
      expect(within(modal).getByText(message)).toBeInTheDocument();
      expect(
        within(modal).getByLabelText(`Sync ${REQUIRED_COLLECTION.name}`),
      ).toBeInTheDocument();
      expect(within(modal).getByText(unsyncableName)).toBeInTheDocument();
      expect(
        within(modal).queryByLabelText(`Sync ${unsyncableName}`),
      ).not.toBeInTheDocument();
      expect(within(modal).getByText("Can't be synced")).toBeInTheDocument();
    },
  );

  it("offers the Library as a switchable row, like any other collection", async () => {
    await setupRefusedSave({ body: createRefusal(LIBRARY_REQUIRED) });

    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByLabelText(`Sync ${LIBRARY_COLLECTION.name}`),
    );
    await dismiss(modal);
    await save();

    await waitFor(async () => {
      expect(await getSettingsPuts()).toHaveLength(2);
    });

    const [, retry] = await getSettingsPuts();
    expect(retry.body).toHaveProperty("collections", {
      [BLOCKED_COLLECTION.id]: true,
      [LIBRARY_COLLECTION.id]: true,
    });
  });

  it.each([
    ["a personal collection", PERSONAL_REQUIRED, /Nick's stuff/, "person icon"],
    [
      "the Library",
      LIBRARY_REQUIRED,
      new RegExp(LIBRARY_COLLECTION.name),
      "repository icon",
    ],
  ])(
    "icons %s by what kind of collection it is",
    async (_label, entry, name, expectedIcon) => {
      await setupRefusedSave({ body: createRefusal(entry) });

      const modal = await screen.findByRole("dialog");
      const row = within(modal).getByRole("button", { name });

      expect(within(row).getByRole("img")).toHaveAttribute(
        "aria-label",
        expectedIcon,
      );
    },
  );

  it("explains a Library blocker with nothing to switch on, when there is no Library yet", async () => {
    await setupRefusedSave({ body: createRefusal(LIBRARY_MISSING_REQUIRED) });

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(/Create the Library in Data Studio/),
    ).toBeInTheDocument();
    expect(within(modal).queryAllByRole("switch")).toHaveLength(0);
  });
});
