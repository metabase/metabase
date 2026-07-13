import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppActionsMenu } from "./DataAppActionsMenu";

// The data-app mutations are real; only the HTTP boundary is stubbed with
// fetch-mock (the endpoints are injected into the main `Api` that
// `renderWithProviders` already wires up). The global jest setup resets
// fetch-mock between tests.
//
// The happy paths (disable / re-enable / remove, and hiding Remove while a repo
// is connected) are covered end-to-end in `data-apps/admin.cy.spec.ts`, so this
// spec only covers the failure and loading branches the e2e doesn't reach.
const setup = ({ enabled = true, canRemove = false } = {}) => {
  const app = createMockDataApp({
    name: "sales",
    display_name: "Sales",
    enabled,
  });
  renderWithProviders(
    <>
      <DataAppActionsMenu app={app} canRemove={canRemove} />
      {/* Mounts the toaster so failure toasts are assertable in the DOM. */}
      <UndoListing />
    </>,
  );
};

const openMenu = () =>
  userEvent.click(screen.getByRole("button", { name: "Actions for Sales" }));

const confirmRemove = async () =>
  userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Remove",
    }),
  );

describe("DataAppActionsMenu", () => {
  it("should show a toast when toggling enabled fails", async () => {
    fetchMock.put("path:/api/apps/sales", 500);
    setup({ enabled: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Disable" }),
    );

    expect(
      await screen.findByText("Failed to update this app"),
    ).toBeInTheDocument();
  });

  it("should show a toast when removal fails", async () => {
    fetchMock.delete("path:/api/apps/sales", 500);
    setup({ canRemove: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await confirmRemove();

    expect(
      await screen.findByText("Failed to remove this data app"),
    ).toBeInTheDocument();
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
