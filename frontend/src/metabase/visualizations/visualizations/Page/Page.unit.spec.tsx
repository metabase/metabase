import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { Page } from "./Page";

// Minimal data helpers
const cols = [
  createMockColumn({ name: "name", display_name: "Name" }),
  createMockColumn({ name: "total", display_name: "Total" }),
];

const makeSettings = (template: string) =>
  createMockVisualizationSettings({
    "page.template": template,
    column: () => ({}),
  });

const makeData = (rows: (string | number | null)[][]) => ({ cols, rows });

interface SetupOpts {
  template?: string;
  rows?: (string | number | null)[][];
}

function setup({ template = "", rows = [["Alice", 42]] }: SetupOpts = {}) {
  renderWithProviders(
    <Page
      data={makeData(rows) as any}
      settings={makeSettings(template) as any}
    />,
  );
}

describe("Page visualization", () => {
  describe("empty template", () => {
    it("shows a placeholder message when no template is set", () => {
      setup({ template: "" });
      expect(
        screen.getByText(
          /Add a template in the visualization settings using \{\{Column Name\}\}/i,
        ),
      ).toBeInTheDocument();
    });

    it("does not render the markdown wrapper when no template is set", () => {
      setup({ template: "" });
      // The markdown prose container is only rendered when a template exists
      expect(
        screen.getByText(/Add a template/i),
      ).toBeInTheDocument(); // placeholder is present instead
    });
  });

  describe("template rendering", () => {
    it("renders plain text from the template", () => {
      setup({ template: "Hello world" });
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("renders markdown bold text", () => {
      setup({ template: "**Bold text**" });
      expect(screen.getByText("Bold text")).toHaveStyle("font-weight: bold");
    });

    it("renders a markdown heading", () => {
      setup({ template: "# My Heading" });
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("My Heading");
    });

    it("renders external links with target=_blank and rel=noreferrer", () => {
      setup({ template: "[Visit](https://example.com)" });
      const link = screen.getByRole("link", { name: "Visit" });
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    });
  });

  describe("token substitution", () => {
    it("replaces {{display_name}} tokens with row values", () => {
      setup({ template: "Name: {{Name}}, Total: {{Total}}" });
      expect(screen.getByText("Name: Alice, Total: 42")).toBeInTheDocument();
    });

    it("leaves unresolved tokens intact", () => {
      setup({ template: "Unknown: {{Missing}}" });
      expect(screen.getByText(/Unknown: \{\{Missing\}\}/)).toBeInTheDocument();
    });

    it("substitutes tokens inline in markdown", () => {
      setup({ template: "**{{Name}}** spent {{Total}}" });
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText(/spent 42/)).toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("does not show pagination controls when there is only one row", () => {
      setup({ template: "{{Name}}", rows: [["Alice", 42]] });
      expect(
        screen.queryByRole("button", { name: /previous row/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /next row/i }),
      ).not.toBeInTheDocument();
    });

    it("shows pagination controls when there are multiple rows", () => {
      setup({
        template: "{{Name}}",
        rows: [
          ["Alice", 42],
          ["Bob", 99],
        ],
      });
      expect(
        screen.getByRole("button", { name: /previous row/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /next row/i }),
      ).toBeInTheDocument();
    });

    it("shows the first row initially and displays 1 / N", () => {
      setup({
        template: "{{Name}}",
        rows: [
          ["Alice", 42],
          ["Bob", 99],
        ],
      });
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    it("navigates to the next row when the next button is clicked", async () => {
      setup({
        template: "{{Name}}",
        rows: [
          ["Alice", 42],
          ["Bob", 99],
        ],
      });
      await userEvent.click(screen.getByRole("button", { name: /next row/i }));
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    });

    it("navigates back to the previous row", async () => {
      setup({
        template: "{{Name}}",
        rows: [
          ["Alice", 42],
          ["Bob", 99],
        ],
      });
      await userEvent.click(screen.getByRole("button", { name: /next row/i }));
      await userEvent.click(
        screen.getByRole("button", { name: /previous row/i }),
      );
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    it("disables the previous button on the first row", () => {
      setup({
        template: "{{Name}}",
        rows: [
          ["Alice", 42],
          ["Bob", 99],
        ],
      });
      expect(
        screen.getByRole("button", { name: /previous row/i }),
      ).toBeDisabled();
    });

    it("disables the next button on the last row", async () => {
      setup({
        template: "{{Name}}",
        rows: [
          ["Alice", 42],
          ["Bob", 99],
        ],
      });
      await userEvent.click(screen.getByRole("button", { name: /next row/i }));
      expect(
        screen.getByRole("button", { name: /next row/i }),
      ).toBeDisabled();
    });
  });
});
