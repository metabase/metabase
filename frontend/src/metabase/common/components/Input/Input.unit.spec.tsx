import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { Input, type InputProps } from "./Input";

const setup = (props: InputProps = {}) => {
  render(<Input {...props} />);
};

describe("Input", () => {
  describe("when rendering basic elements", () => {
    it("renders input field", () => {
      setup({ placeholder: "Enter text" });
      expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
    });

    it("renders subtitle when provided", () => {
      setup({ subtitle: "Test subtitle" });
      expect(screen.getByText("Test subtitle")).toBeInTheDocument();
    });
  });

  describe("when rendering icons", () => {
    it("renders left icon when provided", () => {
      setup({ leftIcon: "search" });
      expect(screen.getByTestId("input-left-icon-button")).toBeInTheDocument();
    });

    it("renders right icon when provided", () => {
      setup({ rightIcon: "close" });
      expect(screen.getByTestId("input-right-icon-button")).toBeInTheDocument();
    });

    it("renders reset button when value is present and onResetClick is provided", () => {
      setup({ value: "Test", onChange: jest.fn(), onResetClick: jest.fn() });
      expect(screen.getByTestId("input-reset-button")).toBeInTheDocument();
    });
  });

  describe("when handling user interactions", () => {
    it("calls onLeftIconClick when left icon is clicked", async () => {
      const onLeftIconClick = jest.fn();
      setup({ leftIcon: "search", onLeftIconClick });

      await userEvent.click(screen.getByTestId("input-left-icon-button"));
      expect(onLeftIconClick).toHaveBeenCalledTimes(1);
    });

    it("calls onRightIconClick when right icon is clicked", async () => {
      const onRightIconClick = jest.fn();
      setup({ rightIcon: "close", onRightIconClick });

      await userEvent.click(screen.getByTestId("input-right-icon-button"));
      expect(onRightIconClick).toHaveBeenCalledTimes(1);
    });

    it("calls onResetClick when reset button is clicked", async () => {
      const onResetClick = jest.fn();
      setup({ value: "Test", onChange: jest.fn(), onResetClick });

      await userEvent.click(screen.getByTestId("input-reset-button"));
      expect(onResetClick).toHaveBeenCalledTimes(1);
    });

    it("calls onChange when input value changes", async () => {
      const onChange = jest.fn();
      setup({ onChange });

      await userEvent.type(screen.getByRole("textbox"), "Test input");
      expect(onChange).toHaveBeenCalledTimes(10);
    });
  });

  describe("when handling tooltips", () => {
    describe("for left icon", () => {
      it("shows tooltip on hover when leftIconTooltip is provided", async () => {
        setup({ leftIcon: "search", leftIconTooltip: "Search" });
        const leftIcon = screen.getByTestId("input-left-icon-button");

        expect(screen.queryByText("Search")).not.toBeInTheDocument();
        await userEvent.hover(leftIcon);
        expect(await screen.findByText("Search")).toBeInTheDocument();
      });

      it("does not show tooltip when leftIconTooltip is not provided", async () => {
        setup({ leftIcon: "search" });
        const leftIcon = screen.getByTestId("input-left-icon-button");

        await userEvent.hover(leftIcon);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });
    });

    describe("for right icon", () => {
      it("shows tooltip on hover when rightIconTooltip is provided", async () => {
        setup({ rightIcon: "close", rightIconTooltip: "Close" });
        const rightIcon = screen.getByTestId("input-right-icon-button");

        expect(screen.queryByText("Close")).not.toBeInTheDocument();
        await userEvent.hover(rightIcon);
        expect(await screen.findByText("Close")).toBeInTheDocument();
      });

      it("does not show tooltip when rightIconTooltip is not provided", async () => {
        setup({ rightIcon: "close" });
        const rightIcon = screen.getByTestId("input-right-icon-button");

        await userEvent.hover(rightIcon);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });
    });

    describe("for reset button", () => {
      it("shows tooltip on hover", async () => {
        setup({ value: "Test", onChange: jest.fn(), onResetClick: jest.fn() });
        const resetButton = screen.getByTestId("input-reset-button");

        expect(screen.queryByText("Clear")).not.toBeInTheDocument();
        await userEvent.hover(resetButton);
        expect(await screen.findByText("Clear")).toBeInTheDocument();
      });
    });
  });
});
