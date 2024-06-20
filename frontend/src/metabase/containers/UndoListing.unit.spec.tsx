import { renderWithProviders, screen } from "__support__/ui";
import type { UndoState } from "metabase-types/store/undo";

import { UndoListing } from "./UndoListing";

const AUTO_CONNECT_UNDO: UndoState[number] = {
  icon: null,
  message:
    "Auto-connect this filter to all questions containing “Product.Title”, in the current tab?",
  actionLabel: "Auto-connect",
  timeout: 12000,
  id: 0,
  _domId: 1,
  canDismiss: true,
};

describe("UndoListing", () => {
  it("renders list of Undo toasts", () => {
    renderWithProviders(<UndoListing />, {
      storeInitialState: {
        undo: [AUTO_CONNECT_UNDO],
      },
    });

    expect(screen.getByTestId("undo-list")).toBeInTheDocument();
    expect(screen.getByTestId("toast-undo")).toBeInTheDocument();
  });

  it("should render progress bar", () => {
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

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
