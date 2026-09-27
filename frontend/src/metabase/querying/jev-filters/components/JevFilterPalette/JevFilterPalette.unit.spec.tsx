import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  JevFilterSuggestion,
  JevFilterSuggestions,
} from "metabase/api/jev-filters";

import type { JevPaletteRowSpec } from "../../types";

import { JevFilterPalette } from "./JevFilterPalette";

const ROWS: JevPaletteRowSpec[] = [
  { id: "vendor", name: "Vendor", currentValue: "Any" },
  { id: "created", name: "Created At", currentValue: "Any" },
  { id: "category", name: "Category", currentValue: "Gizmo" },
];

const VENDOR: JevFilterSuggestion = {
  parameter_id: "vendor",
  parameter_name: "Vendor",
  parameter_type: "string/=",
  value: ["Pouros and Sons"],
  label: "Pouros and Sons",
  confidence: 0.92,
  alternatives: [
    { value: ["Pouros and Sons"], label: "Pouros and Sons", probability: 0.92 },
    { value: ["Pouros Inc"], label: "Pouros Inc", probability: 0.05 },
  ],
};

const CREATED: JevFilterSuggestion = {
  parameter_id: "created",
  parameter_name: "Created At",
  parameter_type: "date/all-options",
  value: "past1weeks",
  label: "Last week",
  confidence: 0.4,
  alternatives: [
    { value: "past1weeks", label: "Last week", probability: 0.4 },
    { value: "thisweek", label: "This week", probability: 0.35 },
  ],
};

const EXTRA: JevFilterSuggestion = {
  parameter_id: "state",
  parameter_name: "State",
  parameter_type: "string/=",
  value: ["CA"],
  label: "CA",
  confidence: 0.81,
  alternatives: [],
};

function createResponse(
  filters: JevFilterSuggestion[],
  opts: Partial<JevFilterSuggestions> = {},
): JevFilterSuggestions {
  return {
    status: "ok",
    filters,
    candidate_count: 10,
    elapsed_ms: 240,
    jev_ms: 185,
    ...opts,
  };
}

interface SetupOpts {
  suggest?: jest.Mock<Promise<JevFilterSuggestions>, [string]>;
}

function setup({
  suggest = jest.fn((_text: string) =>
    Promise.resolve(createResponse([VENDOR, CREATED])),
  ),
}: SetupOpts = {}) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  renderWithProviders(
    <JevFilterPalette
      opened
      onClose={onClose}
      rows={ROWS}
      suggest={suggest}
      onApply={onApply}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Describe your filters" });
  return { input, suggest, onApply, onClose };
}

function getRow(name: string) {
  return screen.getByRole("option", { name });
}

function getSelectedChip(rowName: string) {
  return within(getRow(rowName)).getByRole("button", { pressed: true });
}

async function typeAndWaitForSuggestions(input: HTMLElement, text: string) {
  await userEvent.type(input, text);
  await screen.findByText("Pouros Inc");
}

describe("JevFilterPalette", () => {
  it("lists every filter with its current value and focuses the text input", async () => {
    const { input } = setup();

    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(within(getRow("Category")).getByText("Gizmo")).toBeInTheDocument();
    expect(
      screen.getByText("↑↓ filter · ⇥ ←→ value · ↵ apply · esc close"),
    ).toBeInTheDocument();
  });

  it("debounces typing into one request and proposes values with confidence", async () => {
    const { input, suggest } = setup();

    await typeAndWaitForSuggestions(input, "pouros last week");

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith("pouros last week");
    expect(getSelectedChip("Vendor")).toHaveTextContent("Pouros and Sons92%");
    // Low-confidence picks start on "No change".
    expect(getSelectedChip("Created At")).toHaveTextContent("No change");
    expect(
      within(getRow("Created At")).getByRole("button", { name: /Last week/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("jev-filter-latency")).toHaveTextContent(
      "Jev · 185ms",
    );
    expect(input).toHaveFocus();
  });

  it("moves the active row with the arrow keys and wraps around", async () => {
    const { input } = setup();
    const activeRowId = () => input.getAttribute("aria-activedescendant");

    expect(activeRowId()).toBe(getRow("Vendor").id);
    await userEvent.keyboard("{ArrowDown}");
    expect(activeRowId()).toBe(getRow("Created At").id);
    expect(getRow("Created At")).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(activeRowId()).toBe(getRow("Category").id);
    await userEvent.keyboard("{ArrowDown}");
    expect(activeRowId()).toBe(getRow("Vendor").id);
  });

  it("cycles the active row's value with Tab, Shift+Tab and the arrow keys", async () => {
    const { input } = setup();
    await typeAndWaitForSuggestions(input, "pouros");

    await userEvent.keyboard("{Tab}");
    expect(getSelectedChip("Vendor")).toHaveTextContent("Pouros Inc");
    await userEvent.keyboard("{Tab}");
    expect(getSelectedChip("Vendor")).toHaveTextContent("No change");
    await userEvent.keyboard("{Tab}");
    expect(getSelectedChip("Vendor")).toHaveTextContent("Pouros and Sons");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(getSelectedChip("Vendor")).toHaveTextContent("No change");

    // → at the end of the text cycles, and ← right after cycles back.
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    expect(getSelectedChip("Created At")).toHaveTextContent("Last week");
    await userEvent.keyboard("{ArrowRight}");
    expect(getSelectedChip("Created At")).toHaveTextContent("This week");
    await userEvent.keyboard("{ArrowLeft}");
    expect(getSelectedChip("Created At")).toHaveTextContent("Last week");
    expect(input).toHaveFocus();
  });

  it("keeps ← for moving the caret while typing", async () => {
    const { input } = setup();
    await typeAndWaitForSuggestions(input, "pouros");

    await userEvent.keyboard("{ArrowDown}{ArrowLeft}");

    expect(getSelectedChip("Created At")).toHaveTextContent("No change");
    expect(input).toHaveProperty("selectionStart", "pouros".length - 1);
  });

  it("applies every row not set to No change on Enter and closes", async () => {
    const { input, onApply, onClose } = setup();
    await typeAndWaitForSuggestions(input, "pouros last week");

    await userEvent.keyboard("{ArrowDown}{Tab}{Tab}{Enter}");

    expect(onApply).toHaveBeenCalledWith([
      {
        suggestion: VENDOR,
        value: ["Pouros and Sons"],
        label: "Pouros and Sons",
        parameterType: "string/=",
      },
      {
        suggestion: CREATED,
        value: "thisweek",
        label: "This week",
        parameterType: "date/all-options",
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("selects an option when its chip is clicked", async () => {
    const { input, onApply } = setup();
    await typeAndWaitForSuggestions(input, "pouros");

    await userEvent.click(
      within(getRow("Vendor")).getByRole("button", { name: /No change/ }),
    );
    await userEvent.click(
      within(getRow("Created At")).getByRole("button", { name: /Last week/ }),
    );
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      getRow("Created At").id,
    );
    await userEvent.keyboard("{Enter}");

    expect(onApply).toHaveBeenCalledWith([
      {
        suggestion: CREATED,
        value: "past1weeks",
        label: "Last week",
        parameterType: "date/all-options",
      },
    ]);
  });

  it("fetches right away on Enter and applies confident picks when they arrive", async () => {
    const { input, suggest, onApply, onClose } = setup();

    await userEvent.type(input, "pouros{Enter}");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith([
      {
        suggestion: VENDOR,
        value: ["Pouros and Sons"],
        label: "Pouros and Sons",
        parameterType: "string/=",
      },
    ]);
  });

  it("closes on Escape without applying", async () => {
    const { input, onApply, onClose } = setup();
    await typeAndWaitForSuggestions(input, "pouros");

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("appends suggested filters that aren't listed yet", async () => {
    const suggest = jest.fn((_text: string) =>
      Promise.resolve(createResponse([VENDOR, EXTRA])),
    );
    const { input } = setup({ suggest });

    await userEvent.type(input, "pouros in california");

    expect(
      await screen.findByRole("option", { name: "State" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option").at(-1)).toHaveAccessibleName("State");
    expect(getSelectedChip("State")).toHaveTextContent("CA81%");
  });

  it("ignores stale responses", async () => {
    let resolveFirst: (value: JevFilterSuggestions) => void = () => {};
    const suggest = jest
      .fn<Promise<JevFilterSuggestions>, [string]>()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(Promise.resolve(createResponse([])));
    const { input } = setup({ suggest });

    await userEvent.type(input, "one");
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    await userEvent.type(input, " two");
    expect(await screen.findByText("No matching filters")).toBeInTheDocument();

    resolveFirst(createResponse([VENDOR]));
    await waitFor(() =>
      expect(screen.queryByText("Pouros and Sons")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("No matching filters")).toBeInTheDocument();
  });

  it("says when Jev is unavailable", async () => {
    const suggest = jest.fn((_text: string) =>
      Promise.resolve(createResponse([], { status: "unavailable" })),
    );
    const { input } = setup({ suggest });

    await userEvent.type(input, "pouros");

    expect(
      await screen.findByText("Jev is unavailable right now"),
    ).toBeInTheDocument();
  });
});
