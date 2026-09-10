import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";

import { ACCOUNTS_CATALOG } from "../../generators/__fixtures__/catalogs";
import {
  renderWithLiveViewer,
  renderWithStaticViewer,
} from "../../tests/setup";
import { TEST_GENERATOR } from "../../tests/test-generator";
import { getInitialCubeViewerState } from "../../utils/viewer-state";

import { SettingsModal } from "./SettingsModal";

jest.mock("../../analytics", () => ({
  trackMetricCubeViewerSettingsApplied: jest.fn(),
  trackMetricCubeViewerReset: jest.fn(),
}));

const CATALOG = ACCOUNTS_CATALOG;

function getCardIds() {
  return screen.getByTestId("viewer-card-ids").textContent?.split("\n") ?? [];
}

describe("SettingsModal", () => {
  it("shows the current settings and regenerates the cards on Apply", async () => {
    const onClose = jest.fn();
    renderWithLiveViewer({
      catalog: CATALOG,
      generator: TEST_GENERATOR,
      children: <SettingsModal onClose={onClose} />,
    });

    expect(screen.getByText("Viewer settings")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Accounts")).toBeInTheDocument();
    expect(within(dialog).getByText("Active Subscription")).toBeInTheDocument();
    expect(getCardIds()).toEqual(["overview:m1", "single:m1:field:8"]);

    await userEvent.click(screen.getByLabelText("Dimensions to display"));
    await userEvent.click(await screen.findByRole("option", { name: "Plan" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(getCardIds()).toEqual([
        "overview:m1",
        "single:m1:field:8",
        "single:m1:field:4",
      ]);
    });
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("viewer-mode")).toHaveTextContent("coarse");
  });

  it("requires at least one measure", async () => {
    renderWithLiveViewer({
      catalog: CATALOG,
      generator: TEST_GENERATOR,
      children: <SettingsModal onClose={jest.fn()} />,
    });

    // Backspace on the empty search removes the last selected value.
    await userEvent.click(screen.getByLabelText("Measures to display"));
    await userEvent.keyboard("{Backspace}");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByText("Select at least one measure"),
    ).toBeInTheDocument();
    expect(getCardIds()).toEqual(["overview:m1", "single:m1:field:8"]);
  });

  it("does not offer numeric dimensions as filters", async () => {
    renderWithLiveViewer({
      catalog: CATALOG,
      generator: TEST_GENERATOR,
      children: <SettingsModal onClose={jest.fn()} />,
    });

    await userEvent.click(screen.getByLabelText("Dimensions to filter on"));
    expect(await screen.findByRole("option", { name: "Plan" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Seats" }),
    ).not.toBeInTheDocument();
  });

  it("closes without applying when nothing changed", async () => {
    const onClose = jest.fn();
    const { actions } = renderWithStaticViewer({
      catalog: CATALOG,
      generator: TEST_GENERATOR,
      state: getInitialCubeViewerState(CATALOG, TEST_GENERATOR),
      children: <SettingsModal onClose={onClose} />,
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.applyCoarseSettings).not.toHaveBeenCalled();
  });

  describe("in fine mode", () => {
    const fineState = {
      ...getInitialCubeViewerState(CATALOG, TEST_GENERATOR),
      mode: "fine" as const,
    };

    it("disables the fields and explains why", () => {
      renderWithStaticViewer({
        catalog: CATALOG,
        generator: TEST_GENERATOR,
        state: fineState,
        children: <SettingsModal onClose={jest.fn()} />,
      });

      expect(screen.getByLabelText("Measures to display")).toBeDisabled();
      expect(screen.getByLabelText("Dimensions to display")).toBeDisabled();
      expect(screen.getByLabelText("Dimensions to filter on")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      expect(
        screen.getByText(
          "You've edited cards directly. Reset the viewer to use these settings again.",
        ),
      ).toBeInTheDocument();
    });

    it("asks for confirmation before resetting", async () => {
      const onClose = jest.fn();
      const { actions } = renderWithStaticViewer({
        catalog: CATALOG,
        generator: TEST_GENERATOR,
        state: fineState,
        children: <SettingsModal onClose={onClose} />,
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Reset viewer" }),
      );
      expect(await screen.findByText("Reset viewer?")).toBeInTheDocument();
      expect(
        screen.getByText(
          "This removes your card edits and filters and regenerates the default cards.",
        ),
      ).toBeInTheDocument();
      expect(actions.reset).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Reset" }));

      expect(actions.reset).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
