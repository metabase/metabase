import type { Store } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { State } from "metabase/redux/store";
import type { Undo } from "metabase/redux/store/undo";
import { addUndo, dismissUndo } from "metabase/redux/undo";

import { UndoListing } from "./UndoListing";

type UndoOverride = Partial<Omit<Undo, "_domId">>;

async function setup(undo: Undo) {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const { store } = renderWithProviders(<UndoListing />, {
    storeInitialState: {
      undo: [undo],
    },
  });

  await screen.findByRole("status");

  return { user, store };
}

afterEach(() => jest.useRealTimers());

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
    const { user } = await setup(makeUndo({ actions: [action] }));

    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(action).toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("performs and dismisses the toast when the extra action is clicked", async () => {
    const action = jest.fn();
    const { user } = await setup(
      makeUndo({
        extraAction: { label: "See all", action },
      }),
    );

    await user.click(screen.getByRole("button", { name: "See all" }));

    await waitFor(() => {
      expect(action).toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("variants", () => {
    async function setupAdded(undo: Partial<Undo>) {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { store } = renderWithProviders(<UndoListing />);

      await act(async () => {
        store.dispatch(addUndo({ message: "Something happened", ...undo }));
      });

      const toast = await screen.findByRole("status");
      return { user, toast };
    }

    it.each([
      { variant: undefined, renderedVariant: "neutral", icon: "check_filled" },
      { variant: "neutral", renderedVariant: "neutral", icon: "check_filled" },
      { variant: "negative", renderedVariant: "negative", icon: "warning" },
      {
        variant: "warning",
        renderedVariant: "warning",
        icon: "warning_triangle_filled",
      },
    ] as const)(
      "renders a $renderedVariant toast with the $icon icon (variant: $variant)",
      async ({ variant, renderedVariant, icon }) => {
        const { toast } = await setupAdded({ variant });

        expect(toast).toHaveAttribute("data-variant", renderedVariant);
        expect(screen.getByLabelText(`${icon} icon`)).toBeInTheDocument();
      },
    );

    it.each(["Retry", "More info"] as const)(
      "performs the %s action on a colored toast and dismisses it",
      async (buttonName) => {
        const handlers = { Retry: jest.fn(), "More info": jest.fn() };
        const { user } = await setupAdded({
          variant: "negative",
          actions: [handlers.Retry],
          actionLabel: "Retry",
          extraAction: { label: "More info", action: handlers["More info"] },
        });

        await user.click(screen.getByRole("button", { name: buttonName }));

        await waitFor(() => {
          expect(screen.queryByRole("status")).not.toBeInTheDocument();
        });
        expect(handlers[buttonName]).toHaveBeenCalledTimes(1);
      },
    );

    it("dismisses a colored toast with its close icon", async () => {
      const { user } = await setupAdded({ variant: "warning" });

      await user.click(screen.getByLabelText("close icon"));

      await waitFor(() => {
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    });
  });

  describe("auto-dismiss", () => {
    const TIMEOUT = 5000;

    // a dismissed toast stays mounted until its exit transition finishes,
    // so settle it before asserting either way
    async function expectDismissed() {
      await tick(1000);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }

    async function expectStillOpen() {
      await tick(1000);
      expect(screen.getByRole("status")).toBeInTheDocument();
    }

    async function setupTimed(undo: Partial<Undo> = {}) {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { store } = renderWithProviders(<UndoListing />);

      await act(async () => {
        store.dispatch(addUndo({ message: "Saved", ...undo }));
      });
      // let the toast's enter transition start
      await tick(10);
      expect(screen.getByRole("status")).toBeInTheDocument();

      return { user };
    }

    it("dismisses the toast after the default timeout", async () => {
      await setupTimed();

      await tick(TIMEOUT);

      await expectDismissed();
    });

    it.each([{ showProgress: false }, { showProgress: true }])(
      "keeps the toast open while hovered (%o)",
      async (undo) => {
        const { user } = await setupTimed(undo);

        await user.hover(screen.getByRole("status"));
        await tick(TIMEOUT * 2);
        await expectStillOpen();

        await user.unhover(screen.getByRole("status"));
        await tick(TIMEOUT);
        await expectDismissed();
      },
    );

    it("keeps the toast open while it has keyboard focus", async () => {
      const { user } = await setupTimed({ actions: [jest.fn()] });

      await user.tab();
      expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
      await tick(TIMEOUT * 2);
      await expectStillOpen();

      await user.tab();
      await tick(TIMEOUT);
      await expectDismissed();
    });

    it("stays paused when the pointer leaves while it still has focus", async () => {
      const { user } = await setupTimed({ actions: [jest.fn()] });

      await user.hover(screen.getByRole("status"));
      await user.tab();
      await user.unhover(screen.getByRole("status"));
      await tick(TIMEOUT * 2);

      await expectStillOpen();
    });

    it("toast replaced under same id while hovered stays open", async () => {
      const { user, store } = await setup(
        makeUndo({ id: "paste", timeout: null, message: "Saving" }),
      );
      await user.hover(screen.getByRole("status"));

      await act(async () => {
        store.dispatch(addUndo({ id: "paste", message: "Saved" }));
      });
      await tick(7000);
      expect(undosInStore(store)).toEqual(["paste:Saved"]);
    });

    it("unhovering a replaced toast does not dismiss it immediately", async () => {
      const { user, store } = await setup(
        makeUndo({ id: "paste", timeout: null, message: "Saving" }),
      );

      await user.hover(screen.getByRole("status"));
      await act(async () => {
        store.dispatch(addUndo({ id: "paste", message: "Saved" }));
      });
      await tick(1000);
      await user.unhover(screen.getByRole("status"));
      await tick(100);
      expect(undosInStore(store)).toEqual(["paste:Saved"]);
    });

    it("unhovering an exiting toast does not dismiss a later toast with the same id", async () => {
      const { user, store } = await setup(
        makeUndo({ id: "paste", message: "Saved", startedAt: Date.now() }),
      );

      await user.hover(screen.getByRole("status"));
      await tick(1000);
      await act(async () => {
        store.dispatch(dismissUndo({ undoId: "paste" }));
      });
      await tick(10);
      await user.unhover(screen.getByRole("status"));
      await tick(1000);
      await act(async () => {
        store.dispatch(
          addUndo({ id: "paste", timeout: null, message: "Saving again" }),
        );
      });
      await tick(15000);
      expect(undosInStore(store)).toEqual(["paste:Saving again"]);
    });
  });
});

function makeUndo(override: UndoOverride = {}): Undo {
  const id = override.id ?? 0;
  return {
    icon: null,
    message:
      "Auto-connect this filter to all questions containing “Product.Title”, in the current tab?",
    timeout: 12000,
    timeoutId: null,
    canDismiss: true,
    id,
    _domId: id,
    ...override,
  };
}

function tick(ms: number) {
  return act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function undosInStore(store: Store<State>) {
  return store.getState().undo.map((undo) => `${undo.id}:${undo.message}`);
}
