import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockCard } from "metabase-types/api/mocks";

import { AIMarkdown } from "./AIMarkdown";

const setup = (props: ComponentProps<typeof AIMarkdown>) => {
  setupEnterprisePlugins();
  const settings = mockSettings({ "site-url": "http://localhost:3000" });

  fetchMock.get(
    "path:/api/card/123",
    createMockCard({ id: 123, name: "Test Question" }),
  );

  return renderWithProviders(<AIMarkdown {...props} />, {
    storeInitialState: createMockState({ settings }),
  });
};

describe("AIMarkdown", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.mocked(navigator.clipboard.writeText).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render internal links for Metabase protocol links", async () => {
    setup({ children: "[My Question](metabase://question/123)" });

    // Wait for the component to render
    const link = await screen.findByText("My Question");
    expect(link).toBeInTheDocument();

    // Verify it's rendered as a smart link by checking for the icon
    expect(screen.getByRole("img", { name: /icon/ })).toBeInTheDocument();
  });

  it("should render GFM tables", async () => {
    setup({
      children: `
| Name | Value |
| --- | --- |
| Revenue | $42 |
| Profit | $12 |
      `.trim(),
    });

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Value" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "$42" })).toBeInTheDocument();
  });

  it("dispatches data point mention clicks", async () => {
    const listener = jest.fn();
    window.addEventListener("metabot:data-point-mention-click", listener);

    setup({ children: "[Dec 2025 · 2.85K](metabase://data-point/7)" });

    await userEvent.click(screen.getByRole("button", { name: /Dec 2025/ }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { id: 7 } }),
    );
    window.removeEventListener("metabot:data-point-mention-click", listener);
  });

  it("dispatches state-backed data point mention clicks", async () => {
    const listener = jest.fn();
    const dataPointId = "f10cfc50-2a0b-4c67-a064-7585d17974c7";
    const target = {
      columns: ["Created At", "Revenue"],
      row: ["2026-01-01", 123],
      value_column_index: 1,
    };
    window.addEventListener("metabot:data-point-mention-click", listener);

    setup({
      children: `[Dec 2025 · 2.85K](metabase://data-point/${dataPointId})`,
      dataPointTargets: { [dataPointId]: target },
    });

    await userEvent.click(screen.getByRole("button", { name: /Dec 2025/ }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ target }) }),
    );
    window.removeEventListener("metabot:data-point-mention-click", listener);
  });

  it("targets a specific column via the trailing column index", async () => {
    const listener = jest.fn();
    const dataPointId = "f10cfc50-2a0b-4c67-a064-7585d17974c7";
    const target = {
      columns: ["Customer", "Revenue"],
      row: ["Alanis Kovacek", 123],
      value_column_index: 1,
    };
    window.addEventListener("metabot:data-point-mention-click", listener);

    // The URL targets column 0 (Customer), overriding the stored value column.
    setup({
      children: `[Alanis Kovacek](metabase://data-point/${dataPointId}/0)`,
      dataPointTargets: { [dataPointId]: target },
    });

    await userEvent.click(screen.getByRole("button", { name: /Alanis/ }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          id: dataPointId,
          target: { ...target, value_column_index: 0 },
        }),
      }),
    );
    window.removeEventListener("metabot:data-point-mention-click", listener);
  });

  describe("streaming animation", () => {
    it("wraps each word in its own animation span when animating", async () => {
      setup({ children: "hello world", animate: true });

      // each word becomes its own element carrying the animation marker, revealed
      // word-by-word by the smoothing buffer
      expect(await screen.findByText("hello")).toHaveAttribute(
        "data-anim-word",
      );
      expect(await screen.findByText("world")).toHaveAttribute(
        "data-anim-word",
      );
    });

    it("does not split or wrap words when not animating", async () => {
      setup({ children: "hello world", animate: false });

      expect(await screen.findByText("hello world")).toBeInTheDocument();
      // words are not individually wrapped, so a single-word lookup misses
      expect(screen.queryByText("hello")).not.toBeInTheDocument();
    });

    it("does not animate text inside code spans", async () => {
      setup({ children: "run `the code` now", animate: true });

      // prose outside the code span animates...
      expect(await screen.findByText("now")).toHaveAttribute("data-anim-word");
      // ...but code content stays a single node with no per-word marker
      expect(screen.getByText("the code")).not.toHaveAttribute(
        "data-anim-word",
      );
    });

    it("still renders smart links while animating", async () => {
      setup({
        children: "[My Question](metabase://question/123)",
        animate: true,
      });

      expect(await screen.findByText("My Question")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /icon/ })).toBeInTheDocument();
    });
  });

  it("should copy fenced code blocks", async () => {
    setup({
      children: `
\`\`\`sql
SELECT *
FROM orders
\`\`\`
      `.trim(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Copy code" }),
    );

    const writeText = jest.mocked(navigator.clipboard.writeText);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("SELECT *\nFROM orders");
    expect(writeText.mock.calls[0][0]).not.toContain("```");
  });
});
