import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { WidgetStatusButton } from "./WidgetStatusButton";
import type { Status } from "./types";

interface SetupOpts {
  status: Status;
}

function setup({ status }: SetupOpts) {
  const onClick = jest.fn();

  render(<WidgetStatusButton status={status} onClick={onClick} />);

  return { onClick };
}

describe("WidgetStatusButton", () => {
  describe("status='clear'", () => {
    it("renders correctly", () => {
      setup({ status: "clear" });

      expect(screen.getByLabelText("close icon")).toBeInTheDocument();
      expect(screen.queryByText("Clear filter")).not.toBeInTheDocument();
      expect(screen.getByRole("button")).toBeEnabled();
    });

    it("has tooltip", async () => {
      setup({ status: "clear" });

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      await userEvent.hover(screen.getByRole("button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Clear filter");
    });

    it("is clickable", async () => {
      const { onClick } = setup({ status: "clear" });

      expect(onClick).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("status='reset'", () => {
    it("renders correctly", () => {
      setup({ status: "reset" });

      expect(screen.getByLabelText("refresh icon")).toBeInTheDocument();
      expect(
        screen.queryByText("Reset filter to default state"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button")).toBeEnabled();
    });

    it("has tooltip", async () => {
      setup({ status: "reset" });

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      await userEvent.hover(screen.getByRole("button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Reset filter to default state",
      );
    });

    it("is clickable", async () => {
      const { onClick } = setup({ status: "reset" });

      expect(onClick).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("status='empty'", () => {
    it("renders correctly", () => {
      setup({ status: "empty" });

      expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not have tooltip", async () => {
      setup({ status: "empty" });

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      await userEvent.hover(screen.getByRole("button"), {
        pointerEventsCheck: 0,
      });
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("is not clickable", async () => {
      const { onClick } = setup({ status: "empty" });

      expect(onClick).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button"), {
        pointerEventsCheck: 0,
      });
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("status='none'", () => {
    it("renders correctly", () => {
      setup({ status: "none" });

      expect(screen.getByLabelText("empty icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not have tooltip", async () => {
      setup({ status: "none" });

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      await userEvent.hover(screen.getByRole("button"), {
        pointerEventsCheck: 0,
      });
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("is not clickable", async () => {
      const { onClick } = setup({ status: "none" });

      expect(onClick).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button"), {
        pointerEventsCheck: 0,
      });
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
