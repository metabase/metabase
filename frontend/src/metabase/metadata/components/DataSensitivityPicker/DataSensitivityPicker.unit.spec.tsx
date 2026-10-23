import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type {
  FieldDataSensitivity,
  FieldDataSensitivitySource,
} from "metabase-types/api";

import { DataSensitivityPicker } from "./DataSensitivityPicker";

interface SetupOpts {
  value?: FieldDataSensitivity | null;
  source?: FieldDataSensitivitySource | null;
  canClear?: boolean;
}

const setup = ({ value = null, source = null, canClear }: SetupOpts = {}) => {
  const onChange = jest.fn();
  const onReset = jest.fn();

  renderWithProviders(
    <DataSensitivityPicker
      label="Data sensitivity"
      source={source}
      value={value}
      canClear={canClear}
      onChange={onChange}
      onReset={onReset}
    />,
  );

  return { onChange, onReset };
};

describe("DataSensitivityPicker", () => {
  it("shows the label of the current value", () => {
    setup({ value: "PII", source: "deterministic" });

    expect(screen.getByLabelText("Data sensitivity")).toHaveValue(
      "Personally identifiable information",
    );
  });

  it("shows the placeholder when no layer has a value", () => {
    setup();

    const input = screen.getByLabelText("Data sensitivity");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Unspecified");
    expect(screen.queryByText(/^Set by/)).not.toBeInTheDocument();
  });

  it("shows 'Unspecified' when a person cleared the value", () => {
    setup({ value: null, source: "human" });

    expect(screen.getByLabelText("Data sensitivity")).toHaveValue(
      "Unspecified",
    );
  });

  it("lists every category, most severe first, then 'Unspecified'", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Data sensitivity"));
    const options = within(await screen.findByRole("listbox"))
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual([
      "Security credentials and secrets",
      "Infrastructure and system secrets",
      "Protected health information",
      "Biometric and genetic data",
      "Financial and payment card data",
      "Special category personal traits",
      "Personally identifiable information",
      "Intellectual property and code",
      "Confidential business data",
      "Public (not sensitive)",
      "Unspecified",
    ]);
  });

  it("does not offer 'Unspecified' when the value cannot be cleared", async () => {
    setup({ canClear: false });

    await userEvent.click(screen.getByLabelText("Data sensitivity"));
    const listbox = await screen.findByRole("listbox");

    expect(within(listbox).getAllByRole("option")).toHaveLength(10);
    expect(within(listbox).queryByText("Unspecified")).not.toBeInTheDocument();
  });

  it("calls onChange with the selected category", async () => {
    const { onChange } = setup({ value: "PUBLIC", source: "ai" });

    await userEvent.click(screen.getByLabelText("Data sensitivity"));
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText(
        "Protected health information",
      ),
    );

    expect(onChange).toHaveBeenCalledWith("PHI");
  });

  it("calls onChange with null for 'Unspecified'", async () => {
    const { onChange } = setup({ value: "PII", source: "deterministic" });

    await userEvent.click(screen.getByLabelText("Data sensitivity"));
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("Unspecified"),
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it.each([
    ["deterministic", "Set by the automatic classifier"],
    ["ai", "Set by AI"],
  ] as const)(
    "shows the %s source without a reset action",
    (source, sourceLabel) => {
      setup({ value: "PII", source });

      expect(screen.getByText(sourceLabel)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reset to automatic" }),
      ).not.toBeInTheDocument();
    },
  );

  it("offers a reset action for a value a person set", async () => {
    const { onReset } = setup({ value: "PII", source: "human" });

    expect(screen.getByText("Set by a person")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Reset to automatic" }),
    );

    expect(onReset).toHaveBeenCalled();
  });
});
