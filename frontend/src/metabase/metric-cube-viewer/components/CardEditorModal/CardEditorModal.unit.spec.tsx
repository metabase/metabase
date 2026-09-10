import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";

import { ACCOUNTS_CATALOG } from "../../generators/__fixtures__/catalogs";
import {
  renderWithLiveViewer,
  renderWithStaticViewer,
} from "../../tests/setup";
import { TEST_GENERATOR } from "../../tests/test-generator";
import type { CubeCard } from "../../types";
import { getInitialCubeViewerState } from "../../utils/viewer-state";

import { CardEditorModal } from "./CardEditorModal";

jest.mock("../../analytics", () => ({
  trackMetricCubeViewerCardAdded: jest.fn(),
  trackMetricCubeViewerCardEdited: jest.fn(),
}));

const CATALOG = ACCOUNTS_CATALOG;

async function selectOption(label: string, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(
    await screen.findByRole("option", { name: optionName }),
  );
}

async function getOptionNames(label: string) {
  await userEvent.click(screen.getByLabelText(label));
  const listbox = await screen.findByRole("listbox");
  const names = within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent);
  await userEvent.keyboard("{Escape}");
  return names;
}

function setupNew() {
  renderWithLiveViewer({
    catalog: CATALOG,
    generator: TEST_GENERATOR,
    children: <CardEditorModal onClose={jest.fn()} />,
  });
}

describe("CardEditorModal", () => {
  it("offers only the dimensions every selected measure supports", async () => {
    setupNew();

    // "Accounts" supports every dimension, including "Seats".
    expect(await getOptionNames("Dimension")).toContain("Seats");

    await userEvent.click(screen.getByRole("button", { name: /Add measure/ }));
    const measureSelects = screen.getAllByLabelText("Measure");
    await userEvent.click(measureSelects[1]);
    await userEvent.click(
      await screen.findByRole("option", { name: "Average seats" }),
    );

    // "Average seats" lacks "Seats", so the intersection drops it.
    const names = await getOptionNames("Dimension");
    expect(names).toContain("Plan");
    expect(names).not.toContain("Seats");
  });

  it("clears a dimension that a newly added measure does not support", async () => {
    setupNew();

    await selectOption("Dimension", "Seats");
    expect(screen.getByLabelText("Dimension")).toHaveValue("Seats");

    await userEvent.click(screen.getByRole("button", { name: /Add measure/ }));
    await userEvent.click(screen.getAllByLabelText("Measure")[1]);
    await userEvent.click(
      await screen.findByRole("option", { name: "Average seats" }),
    );

    expect(screen.getByLabelText("Dimension")).toHaveValue("None (show total)");
  });

  describe("second dimension", () => {
    it("is disabled until a non-geo first dimension is set", async () => {
      setupNew();

      expect(screen.getByLabelText("Second dimension")).toBeDisabled();

      await selectOption("Dimension", "Country");
      expect(screen.getByLabelText("Second dimension")).toBeDisabled();

      await selectOption("Dimension", "Created At");
      expect(screen.getByLabelText("Second dimension")).toBeEnabled();
    });

    it("is disabled with more than one series", async () => {
      setupNew();

      await selectOption("Dimension", "Created At");
      expect(screen.getByLabelText("Second dimension")).toBeEnabled();

      await userEvent.click(
        screen.getByRole("button", { name: /Add measure/ }),
      );
      expect(screen.getByLabelText("Second dimension")).toBeDisabled();
    });

    it("lists category and boolean dimensions, low-cardinality first and recommended", async () => {
      setupNew();

      await selectOption("Dimension", "Created At");
      await userEvent.click(screen.getByLabelText("Second dimension"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options.map((option) => option.textContent)).toEqual([
        "None",
        "Active SubscriptionRecommended",
        "PlanRecommended",
        "SourceRecommended",
      ]);
      expect(
        within(listbox).queryByRole("option", { name: /Seats/ }),
      ).not.toBeInTheDocument();
    });

    it("uses the series-breakout slot when saving", async () => {
      const { actions } = renderWithStaticViewer({
        catalog: CATALOG,
        generator: TEST_GENERATOR,
        state: getInitialCubeViewerState(CATALOG, TEST_GENERATOR),
        children: <CardEditorModal onClose={jest.fn()} />,
      });

      await selectOption("Dimension", "Created At");
      await selectOption("Second dimension", /Plan/);
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(actions.addCard).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "custom",
          dimensionKeys: ["field:1", "field:4"],
          display: "line",
        }),
      );
    });
  });

  it("resets an invalid display when the dimension type changes", async () => {
    setupNew();

    await selectOption("Dimension", "Seats");
    await userEvent.click(screen.getByLabelText("scatter"));
    expect(screen.getByLabelText("scatter")).toHaveAttribute(
      "data-variant",
      "filled",
    );

    await selectOption("Dimension", "Created At");
    expect(screen.queryByLabelText("scatter")).not.toBeInTheDocument();
    expect(screen.getByLabelText("line")).toHaveAttribute(
      "data-variant",
      "filled",
    );
  });

  it("switches to fine mode when a new card is saved", async () => {
    const onClose = jest.fn();
    renderWithLiveViewer({
      catalog: CATALOG,
      generator: TEST_GENERATOR,
      children: <CardEditorModal onClose={onClose} />,
    });
    expect(screen.getByTestId("viewer-mode")).toHaveTextContent("coarse");

    await selectOption("Segment", "Enterprise");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("viewer-mode")).toHaveTextContent("fine");
    });
    expect(screen.getByTestId("viewer-card-ids")).toHaveTextContent(
      /^overview:m1 single:m1:field:8 [0-9a-f-]{36}$/,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("edits an existing card in place as a custom card", async () => {
    const card: CubeCard = {
      id: "single:m1:field:8",
      kind: "single",
      series: [{ measureId: 1, segmentIds: [] }],
      dimensionKeys: ["field:8"],
      display: "bar",
    };
    const { actions } = renderWithStaticViewer({
      catalog: CATALOG,
      generator: TEST_GENERATOR,
      state: getInitialCubeViewerState(CATALOG, TEST_GENERATOR),
      children: <CardEditorModal card={card} onClose={jest.fn()} />,
    });

    expect(screen.getByText("Edit card")).toBeInTheDocument();
    expect(screen.getByLabelText("Measure")).toHaveValue("Accounts");
    expect(screen.getByLabelText("Dimension")).toHaveValue(
      "Active Subscription",
    );
    expect(screen.getByLabelText("Remove series")).toBeDisabled();

    await selectOption("Measure", "Paying accounts");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(actions.updateCard).toHaveBeenCalledWith({
      id: card.id,
      kind: "custom",
      series: [{ measureId: 4, segmentIds: [] }],
      dimensionKeys: ["field:8"],
      display: "bar",
    });
    expect(actions.addCard).not.toHaveBeenCalled();
  });

  it("allows at most four series", async () => {
    setupNew();

    const addButton = screen.getByRole("button", { name: /Add measure/ });
    await userEvent.click(addButton);
    await userEvent.click(addButton);
    await userEvent.click(addButton);

    expect(screen.getAllByLabelText("Measure")).toHaveLength(4);
    expect(addButton).toBeDisabled();
    expect(screen.getAllByLabelText("Remove series")[0]).toBeEnabled();
  });
});
