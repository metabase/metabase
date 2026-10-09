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
}

const setup = ({ value = null, source = null }: SetupOpts = {}) => {
  const onChange = jest.fn();
  const onReset = jest.fn();

  renderWithProviders(
    <DataSensitivityPicker
      label="Data sensitivity"
      source={source}
      value={value}
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
    expect(input).toHaveAttribute("placeholder", "Not labeled");
    expect(screen.queryByText(/^Set by/)).not.toBeInTheDocument();
  });

  it("shows 'No label' when a person cleared the value", () => {
    setup({ value: null, source: "human" });

    expect(screen.getByLabelText("Data sensitivity")).toHaveValue("No label");
  });

  it("lists every category, most severe first, then 'No label'", async () => {
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
      "No label",
    ]);
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

  it("calls onChange with null for 'No label'", async () => {
    const { onChange } = setup({ value: "PII", source: "deterministic" });

    await userEvent.click(screen.getByLabelText("Data sensitivity"));
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("No label"),
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
