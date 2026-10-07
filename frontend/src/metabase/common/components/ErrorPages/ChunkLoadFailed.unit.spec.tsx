import userEvent from "@testing-library/user-event";

import { renderRoutes, renderWithProviders, screen } from "__support__/ui";
import { reload } from "metabase/utils/dom";

import { ChunkLoadFailed } from "./ErrorPages";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  reload: jest.fn(),
}));

describe("ChunkLoadFailed", () => {
  beforeEach(() => jest.clearAllMocks());

  it("says the app was updated and offers to reload", async () => {
    renderWithProviders(<ChunkLoadFailed />);

    expect(screen.getByText("Metabase was updated")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This page could not be opened. Reload to get the latest version.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
  });

  // Reloading discards the work, so the page says the work is safe before it
  // offers a button that would throw it away.
  it("says unsaved changes are safe, and leads away from reloading", () => {
    renderWithProviders(<ChunkLoadFailed hasUnsavedChanges />);

    expect(
      screen.getByText(
        "This page could not be opened. Your unsaved changes are still here. Save them, then reload to get the latest version.",
      ),
    ).toBeInTheDocument();
  });

  /**
   * The page behind this is still mounted and still holds the unsaved work, so
   * the user has to be able to get back to it. Reloading is the one route back
   * that loses the work.
   */
  it("returns to the page behind it when dismissed", async () => {
    const { router } = renderRoutes(
      [
        { path: "/doc", element: <span data-testid="doc">doc</span> },
        {
          path: "/doc/comments",
          element: <ChunkLoadFailed hasUnsavedChanges />,
        },
      ],
      { initialRoute: "/doc" },
    );

    expect(await screen.findByTestId("doc")).toBeInTheDocument();
    router?.navigate("/doc/comments");
    expect(await screen.findByText("Metabase was updated")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(await screen.findByTestId("doc")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/doc");
    expect(reload).not.toHaveBeenCalled();
  });
});
