import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppActionsMenu } from "./DataAppActionsMenu";

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
