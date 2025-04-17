import { renderWithProviders, screen } from "__support__/ui";
import type { Undo } from "metabase-types/store/undo";

import { UndoListing } from "./UndoListing";

const AUTO_CONNECT_UNDO: Undo = {
  icon: null,
  message:
    "Auto-connect this filter to all questions containing “Product.Title”, in the current tab?",
  actionLabel: "Auto-connect",
  timeout: 12000,
  timeoutId: null,
  id: 0,
  _domId: 1,
  canDismiss: true,
};

describe("UndoListing", () => {
  it("renders list of Undo toasts", async () => {
    renderWithProviders(<UndoListing />, {
      storeInitialState: {
        undo: [AUTO_CONNECT_UNDO],
      },
    });

    expect(await screen.findByTestId("undo-list")).toBeInTheDocument();
    expect(await screen.findByTestId("toast-undo")).toBeInTheDocument();
  });

  it("should render progress bar", async () => {
    renderWithProviders(<UndoListing />, {
      storeInitialState: {
        undo: [
          {
            ...AUTO_CONNECT_UNDO,
            showProgress: true,
          },
        ],
      },
    });

    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
  });
});
