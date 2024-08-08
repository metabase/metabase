import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { WidgetStatus } from "./WidgetStatus";
import type { Status } from "./types";

interface SetupOpts {
  status: Status;
}

function setup({ status }: SetupOpts) {
  const onClick = jest.fn();

  render(<WidgetStatus status={status} onClick={onClick} />);

  return { onClick };
}

describe("WidgetStatus", () => {
  describe("status='clear'", () => {
    it("renders correctly", () => {
      setup({ status: "clear" });

      expect(screen.getByLabelText("close icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeEnabled();
    });

    it("has tooltip", async () => {
      setup({ status: "clear" });

      await userEvent.hover(screen.getByRole("button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Clear");
    });

    it("is clickable", async () => {
      const { onClick } = setup({ status: "clear" });

      await userEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("status='reset'", () => {
    it("renders correctly", () => {
      setup({ status: "reset" });

      expect(screen.getByLabelText("revert icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeEnabled();
    });

    it("has tooltip", async () => {
      setup({ status: "reset" });

      await userEvent.hover(screen.getByRole("button"));
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Reset filter to default state",
      );
    });

    it("is clickable", async () => {
      const { onClick } = setup({ status: "reset" });

      await userEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("status='empty'", () => {
    it("renders correctly", () => {
      setup({ status: "empty" });

      expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("does not have tooltip", async () => {
      setup({ status: "empty" });

      await userEvent.hover(screen.getByRole("img"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("is not clickable", async () => {
      const { onClick } = setup({ status: "empty" });

      await userEvent.click(screen.getByRole("img"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("status='none'", () => {
    it("renders correctly", () => {
      setup({ status: "none" });

      expect(screen.getByLabelText("empty icon")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("does not have tooltip", async () => {
      setup({ status: "none" });

      await userEvent.hover(screen.getByRole("img"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("is not clickable", async () => {
      const { onClick } = setup({ status: "none" });

      await userEvent.click(screen.getByRole("img"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
