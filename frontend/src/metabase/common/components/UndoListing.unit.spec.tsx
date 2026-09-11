import userEvent from "@testing-library/user-event";
import { createRef } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Undo } from "metabase/redux/store/undo";

import { UndoListing } from "./UndoListing";

type UndoOverride = Partial<Omit<Undo, "id" | "_domId">>;

function makeUndo(override: UndoOverride = {}, id = 0): Undo {
  return {
    icon: null,
    message:
      "Auto-connect this filter to all questions containing “Product.Title”, in the current tab?",
    timeout: 12000,
    timeoutId: null,
    canDismiss: true,
    id,
    _domId: id,
    // Matches the ref the addUndo reducer assigns. react-transition-group needs
    // a nodeRef under React 19, which removed the findDOMNode fallback.
    ref: createRef(),
    ...override,
  };
}

async function setup(undo: Undo) {
  renderWithProviders(<UndoListing />, {
    storeInitialState: {
      undo: [undo],
    },
  });

  await screen.findByRole("status");
}

describe("UndoListing", () => {
  it("renders list of Undo toasts", async () => {
    await setup(makeUndo());

    expect(screen.getByRole("list", { name: "undo-list" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders progress bar", async () => {
    await setup(makeUndo({ showProgress: true }));

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the default message when no message is set", async () => {
    await setup(
      makeUndo({ message: null, verb: "archived", subject: "card", count: 1 }),
    );

    expect(screen.getByText("Archived card")).toBeInTheDocument();
  });

  it("pluralizes the default message with the count", async () => {
    await setup(
      makeUndo({ message: null, verb: "archived", subject: "card", count: 3 }),
    );

    expect(screen.getByText("Archived 3 cards")).toBeInTheDocument();
  });

  it("renders the undo button with actionLabel when provided", async () => {
    await setup(
      makeUndo({ actions: [jest.fn()], actionLabel: "Auto-connect" }),
    );

    expect(
      screen.getByRole("button", { name: "Auto-connect" }),
    ).toBeInTheDocument();
  });

  it("performs the undo action and dismisses the toast when clicked", async () => {
    const action = jest.fn();
    await setup(makeUndo({ actions: [action] }));

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(action).toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("performs and dismisses the toast when the extra action is clicked", async () => {
    const action = jest.fn();
    await setup(
      makeUndo({
        extraAction: { label: "See all", action },
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    await waitFor(() => {
      expect(action).toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
