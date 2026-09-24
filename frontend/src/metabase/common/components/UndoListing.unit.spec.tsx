import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Undo } from "metabase/redux/store/undo";
import { addUndo } from "metabase/redux/undo";

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

  describe("auto-dismiss", () => {
    const TIMEOUT = 5000;

    async function advanceTime(ms: number) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    }

    // a dismissed toast stays mounted until its exit transition finishes,
    // so settle it before asserting either way
    async function expectDismissed() {
      await advanceTime(1000);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }

    async function expectStillOpen() {
      await advanceTime(1000);
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
      await advanceTime(10);
      expect(screen.getByRole("status")).toBeInTheDocument();

      return { user };
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it("dismisses the toast after the default timeout", async () => {
      await setupTimed();

      await advanceTime(TIMEOUT);

      await expectDismissed();
    });

    it.each([{ showProgress: false }, { showProgress: true }])(
      "keeps the toast open while hovered (%o)",
      async (undo) => {
        const { user } = await setupTimed(undo);

        await user.hover(screen.getByRole("status"));
        await advanceTime(TIMEOUT * 2);
        await expectStillOpen();

        await user.unhover(screen.getByRole("status"));
        await advanceTime(TIMEOUT);
        await expectDismissed();
      },
    );

    it("keeps the toast open while it has keyboard focus", async () => {
      const { user } = await setupTimed({ actions: [jest.fn()] });

      await user.tab();
      expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
      await advanceTime(TIMEOUT * 2);
      await expectStillOpen();

      await user.tab();
      await advanceTime(TIMEOUT);
      await expectDismissed();
    });

    it("stays paused when the pointer leaves while it still has focus", async () => {
      const { user } = await setupTimed({ actions: [jest.fn()] });

      await user.hover(screen.getByRole("status"));
      await user.tab();
      await user.unhover(screen.getByRole("status"));
      await advanceTime(TIMEOUT * 2);

      await expectStillOpen();
    });
  });
});
