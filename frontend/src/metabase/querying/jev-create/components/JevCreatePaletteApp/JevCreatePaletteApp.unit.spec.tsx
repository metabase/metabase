import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { JevCreatePaletteApp } from "./JevCreatePaletteApp";

jest.mock("metabase/utils/browser", () => ({
  ...jest.requireActual("metabase/utils/browser"),
  isMac: () => true,
}));

interface SetupOpts {
  isLoggedIn?: boolean;
}

function setup({ isLoggedIn = true }: SetupOpts = {}) {
  renderWithProviders(
    <>
      <input aria-label="Other input" />
      <JevCreatePaletteApp />
    </>,
    {
      storeInitialState: createMockState({
        currentUser: isLoggedIn ? createMockUser() : null,
      }),
    },
  );
}

function pressCmdJ() {
  return fireEvent.keyDown(window, { key: "j", metaKey: true });
}

describe("JevCreatePaletteApp", () => {
  it("opens on Cmd+J and stops the browser acting on it", async () => {
    setup();
    expect(pressCmdJ()).toBe(false);
    expect(
      await screen.findByRole("dialog", { name: "New with Jev" }),
    ).toBeInTheDocument();
  });

  it("opens on Ctrl+J on a Mac too", async () => {
    setup();
    expect(fireEvent.keyDown(window, { key: "j", ctrlKey: true })).toBe(false);
    expect(
      await screen.findByRole("dialog", { name: "New with Jev" }),
    ).toBeInTheDocument();
  });

  it("ignores Ctrl+Cmd+J", () => {
    setup();
    expect(
      fireEvent.keyDown(window, { key: "j", ctrlKey: true, metaKey: true }),
    ).toBe(true);
    expect(
      screen.queryByRole("dialog", { name: "New with Jev" }),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    setup();
    pressCmdJ();
    await screen.findByRole("dialog", { name: "New with Jev" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New with Jev" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("leaves Cmd+J alone while an editable element is focused", () => {
    setup();
    screen.getByRole("textbox", { name: "Other input" }).focus();
    expect(pressCmdJ()).toBe(true);
    expect(
      screen.queryByRole("dialog", { name: "New with Jev" }),
    ).not.toBeInTheDocument();
  });

  it("does nothing when logged out", () => {
    setup({ isLoggedIn: false });
    expect(pressCmdJ()).toBe(true);
    expect(
      screen.queryByRole("dialog", { name: "New with Jev" }),
    ).not.toBeInTheDocument();
  });
});
