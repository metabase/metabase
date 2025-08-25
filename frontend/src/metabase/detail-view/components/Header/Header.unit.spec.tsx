import { screen } from "@testing-library/react";

import { getIcon, queryIcon, renderWithProviders } from "__support__/ui";
import type { IconName } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { DatasetColumn, RowValues } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks/dataset";

import { Header } from "./Header";

registerVisualizations();

const AVATAR_COLUMN = createMockColumn({
  name: "avatar",
  base_type: "type/Text",
  semantic_type: "type/AvatarURL",
});

const TITLE_COLUMN = createMockColumn({
  name: "title",
  base_type: "type/Text",
  semantic_type: "type/Title",
});

const PK_COLUMN = createMockColumn({
  name: "id",
  base_type: "type/Integer",
  semantic_type: "type/PK",
});

interface SetupOpts {
  columns?: DatasetColumn[];
  icon?: IconName;
  row?: RowValues;
}

function setup({ columns = [], icon, row = [] }: SetupOpts = {}) {
  renderWithProviders(<Header columns={columns} icon={icon} row={row} />);
}

describe("Header", () => {
  describe("avatar section", () => {
    it("should render avatar when avatar column exists and has value", () => {
      setup({
        columns: [AVATAR_COLUMN, TITLE_COLUMN],
        row: ["https://example.com/avatar.jpg", "Test Title"],
      });

      const avatar = screen.getByRole("img");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
    });

    it("should render icon when no avatar but icon prop is provided", () => {
      setup({ columns: [TITLE_COLUMN], icon: "person" });

      expect(getIcon("person")).toBeInTheDocument();
    });

    it("should not render avatar section when neither avatar nor icon is provided", () => {
      setup({ columns: [TITLE_COLUMN] });

      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("should prioritize avatar over icon when both are available", () => {
      setup({
        columns: [AVATAR_COLUMN, TITLE_COLUMN],
        row: ["https://example.com/avatar.jpg", "Test Title"],
        icon: "person",
      });

      expect(screen.getByRole("img")).toBeInTheDocument();
      expect(queryIcon("person")).not.toBeInTheDocument();
    });
  });

  describe("title section", () => {
    it("should render title when title column exists and has value", () => {
      setup({ columns: [TITLE_COLUMN], row: ["Test Title"] });

      const title = screen.getByRole("heading", { level: 1 });
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent("Test Title");
    });

    it("should not render title when title column is undefined", () => {
      setup({ columns: [PK_COLUMN] });

      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
    });

    it("should not render title when title value is undefined", () => {
      setup({ columns: [TITLE_COLUMN], row: [null] });

      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
    });
  });

  describe("subtitle section", () => {
    it("should render subtitle when subtitle column exists and has value", () => {
      setup({
        columns: [TITLE_COLUMN, PK_COLUMN],
        row: ["Test Title", 123],
      });

      const subtitle = screen.getByRole("heading", { level: 2 });
      expect(subtitle).toBeInTheDocument();
      expect(subtitle).toHaveTextContent("123");
    });

    it("should not render subtitle when subtitle column does not exist", () => {
      setup({ columns: [TITLE_COLUMN] });

      expect(
        screen.queryByRole("heading", { level: 2 }),
      ).not.toBeInTheDocument();
    });

    it("should not render subtitle when subtitle value does not exist", () => {
      setup({
        columns: [TITLE_COLUMN, PK_COLUMN],
        row: ["Test Title", null],
      });

      expect(
        screen.queryByRole("heading", { level: 2 }),
      ).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle empty columns array", () => {
      setup({ columns: [] });

      expect(
        screen.queryByTestId("detail-view-header"),
      ).not.toBeInTheDocument();
    });

    it("should handle empty row array", () => {
      setup({ columns: [TITLE_COLUMN], row: [] });

      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 2 }),
      ).not.toBeInTheDocument();
    });

    it("should handle null/undefined values gracefully", () => {
      setup({
        columns: [TITLE_COLUMN, PK_COLUMN, AVATAR_COLUMN],
        row: [null, null, null],
      });

      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { level: 2 }),
      ).not.toBeInTheDocument();
    });
  });
});
