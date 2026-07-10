import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppActionsMenu } from "./DataAppActionsMenu";

// The data-app mutations are real; only the HTTP boundary is stubbed with
// fetch-mock (the endpoints are injected into the main `Api` that
// `renderWithProviders` already wires up). The global jest setup resets
// fetch-mock between tests.
const setup = ({ enabled = true, canRemove = false } = {}) => {
  const app = createMockDataApp({
    name: "sales",
    display_name: "Sales",
    enabled,
  });
  const { store } = renderWithProviders(
    <DataAppActionsMenu app={app} canRemove={canRemove} />,
  );
  return { store };
};

const openMenu = () =>
  userEvent.click(screen.getByRole("button", { name: "Actions for Sales" }));

const confirmRemove = async () =>
  userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Remove",
    }),
  );

const undoMessages = (store: ReturnType<typeof setup>["store"]) =>
  store.getState().undo.map((undo) => String(undo.message));

describe("DataAppActionsMenu", () => {
  it.each([
    { enabled: true, action: "Disable", nextEnabled: false },
    { enabled: false, action: "Reenable", nextEnabled: true },
  ])(
    "$action-s the app, PUTting enabled=$nextEnabled",
    async ({ enabled, action, nextEnabled }) => {
      fetchMock.put(
        "path:/api/apps/sales",
        createMockDataApp({ enabled: nextEnabled }),
      );
      setup({ enabled });

      await openMenu();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: action }),
      );

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("path:/api/apps/sales", {
            method: "PUT",
          }),
        ).toHaveLength(1),
      );
      const body = await fetchMock.callHistory
        .lastCall("path:/api/apps/sales", { method: "PUT" })
        ?.request?.json();
      expect(body).toEqual({ enabled: nextEnabled });
    },
  );

  it("should show toast when toggling enabled fails", async () => {
    fetchMock.put("path:/api/apps/sales", 500);
    const { store } = setup({ enabled: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Disable" }),
    );

    await waitFor(() =>
      expect(undoMessages(store)).toContain("Failed to update this app"),
    );
  });

  it("should remove an app after confirmation when it can be removed", async () => {
    fetchMock.delete("path:/api/apps/sales", 204);
    setup({ canRemove: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await confirmRemove();

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/apps/sales", {
          method: "DELETE",
        }),
      ).toHaveLength(1),
    );
  });

  it("should show toast when removal fails", async () => {
    fetchMock.delete("path:/api/apps/sales", 500);
    const { store } = setup({ canRemove: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await confirmRemove();

    await waitFor(() =>
      expect(undoMessages(store)).toContain("Failed to remove this data app"),
    );
  });

  it("should hide Remove when the app can't be removed", async () => {
    setup({ canRemove: false });

    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: "Disable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Remove" }),
    ).not.toBeInTheDocument();
  });

  it("should show a loading state on the trigger while a delete is in flight", async () => {
    // Hold the DELETE in flight (a controllable promise, resolved at the end so
    // the global fetch-mock flush doesn't hang) to observe the loading state.
    let finishDelete = () => {};
    fetchMock.delete(
      "path:/api/apps/sales",
      () =>
        new Promise(
          (resolve) => (finishDelete = () => resolve({ status: 204 })),
        ),
    );
    setup({ canRemove: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await confirmRemove();

    const trigger = () =>
      screen.getByRole("button", { name: "Actions for Sales" });

    // Mantine marks a loading ActionIcon with `data-loading`.
    await waitFor(() =>
      expect(trigger()).toHaveAttribute("data-loading", "true"),
    );

    finishDelete();
    await waitFor(() =>
      expect(trigger()).not.toHaveAttribute("data-loading", "true"),
    );
  });
});
