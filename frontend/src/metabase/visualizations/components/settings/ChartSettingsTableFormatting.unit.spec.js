import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockColumn } from "metabase-types/api/mocks";
import ChartSettingsTableFormatting from "./ChartSettingsTableFormatting";

const STRING_COLUMN = createMockColumn({
  base_type: "type/Text",
  display_name: "String Column",
  name: "STRING_COLUMN",
});

const STRING_COLUMN_TWO = createMockColumn({
  base_type: "type/Text",
  display_name: "String Column 2",
  name: "STRING_COLUMN_2",
});

const BOOLEAN_COLUMN = createMockColumn({
  base_type: "type/Boolean",
  display_name: "Boolean Column",
  name: "BOOLEAN_COLUMN",
});

const NUMBER_COLUMN = createMockColumn({
  base_type: "type/Integer",
  display_name: "Number Column",
  name: "NUMBER_COLUMN",
});

const COLUMNS = [
  STRING_COLUMN,
  STRING_COLUMN_TWO,
  BOOLEAN_COLUMN,
  NUMBER_COLUMN,
];

const Wrapper = props => {
  const [value, setValue] = useState([]);

  return (
    <ChartSettingsTableFormatting
      cols={COLUMNS}
      onChange={setValue}
      value={value}
      {...props}
    />
  );
};

const setup = props => {
  render(<Wrapper {...props} />);
};

describe("ChartSettingsTableFormatting", () => {
  it("Should allow you to add a rule", () => {
    setup();
    expect(screen.getByText("Conditional formatting")).toBeInTheDocument();
    userEvent.click(screen.getByText("Add a rule"));
    userEvent.click(screen.getByText("String Column"));
    //Dismiss Popup
    userEvent.click(screen.getByText("Which columns should be affected?"));

    expect(screen.getByText("is equal to")).toBeInTheDocument();

    userEvent.type(
      screen.getByTestId("conditional-formatting-value-input"),
      "toucan",
    );
    userEvent.click(screen.getByText("Add rule"));

    expect(screen.getByText("String Column")).toBeInTheDocument();
    expect(screen.getByText(/is equal to toucan/g)).toBeInTheDocument();
  });

  it("should only let you choose columns of the same type for a rule", () => {
    setup();
    expect(screen.getByText("Conditional formatting")).toBeInTheDocument();
    userEvent.click(screen.getByText("Add a rule"));
    userEvent.click(screen.getByText("String Column"));

    expect(
      screen.getByRole("option", { name: "Number Column" }),
    ).toHaveAttribute("aria-disabled", "true");

    expect(
      screen.getByRole("option", { name: "Boolean Column" }),
    ).toHaveAttribute("aria-disabled", "true");

    expect(
      screen.getByRole("option", { name: "String Column 2" }),
    ).toHaveAttribute("aria-disabled", "false");
  });

  describe("should show propriate operators based on column selection", () => {
    beforeEach(() => {
      setup();
      userEvent.click(screen.getByText("Add a rule"));
    });

    it("string", () => {
      userEvent.click(screen.getByText("String Column"));
      //Dismiss Popup
      userEvent.click(screen.getByText("Which columns should be affected?"));

      userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      expect(
        screen.getByRole("option", { name: "starts with" }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("option", { name: "ends with" }),
      ).toBeInTheDocument();
    });

    it("number", () => {
      userEvent.click(screen.getByText("Number Column"));
      //Dismiss Popup
      userEvent.click(screen.getByText("Which columns should be affected?"));

      userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      expect(
        screen.getByRole("option", { name: "is less than" }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("option", { name: "is greater than" }),
      ).toBeInTheDocument();

      //Quick check for color range option on numberic rules
      expect(screen.getByText("Formatting style")).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /single color/i }),
      ).toBeChecked();
      expect(
        screen.getByRole("radio", { name: /color range/i }),
      ).not.toBeChecked();
    });

    it("boolean", () => {
      userEvent.click(screen.getByText("Boolean Column"));
      //Dismiss Popup
      userEvent.click(screen.getByText("Which columns should be affected?"));

      userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      expect(
        screen.getByRole("option", { name: "is true" }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("option", { name: "is false" }),
      ).toBeInTheDocument();
    });
  });
});
