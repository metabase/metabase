import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupLibraryEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  createMockCard,
  createMockCollection,
  createMockField,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { AIMarkdown } from "./AIMarkdown";

type SetupProps = {
  children: string;
  className?: string;
  isStreaming?: boolean;
  singleNewlinesAreParagraphs?: boolean;
};

const setup = (
  props: SetupProps,
  { conversationCharts }: { conversationCharts?: Record<string, unknown> } = {},
) => {
  setupEnterprisePlugins();
  const settings = mockSettings({
    "site-url": "http://localhost:3000",
    "token-features": createMockTokenFeatures({ library: true }),
  });

  setupLibraryEndpoints(true);
  setupCardEndpoints(createMockCard({ id: 123, name: "Test Question" }));
  setupCardEndpoints(
    createMockCard({
      id: 456,
      name: "ARR",
      type: "metric",
      collection: createMockCollection({ type: "library-metrics" }),
    }),
  );
  setupTableEndpoints(
    createMockTable({
      id: 5,
      display_name: "Orders",
      description: "Confirmed orders",
      is_published: true,
      collection: createMockCollection({
        id: 10,
        name: "Data",
        type: "library-data",
      }),
      fields: [createMockField({ id: 1 }), createMockField({ id: 2 })],
    }),
  );

  const metabot = conversationCharts
    ? assocIn(getMetabotInitialState(), ["conversations", "omnibot", "state"], {
        charts: conversationCharts,
      })
    : getMetabotInitialState();

  return renderWithProviders(<AIMarkdown {...props} />, {
    storeInitialState: createMockState({ settings, metabot }),
  });
};

// Animation spans and paragraph structure have no accessible role to query by.
/* eslint-disable testing-library/no-node-access */
const animatedWords = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-streamed-word]")).map(
    (span) => span.textContent,
  );

const renderedText = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("p"))
    .map((p) => p.textContent)
    .join(" ");

const hasElement = (container: HTMLElement, selector: string) =>
  container.querySelector(selector) !== null;

const countElements = (container: HTMLElement, selector: string) =>
  container.querySelectorAll(selector).length;
/* eslint-enable testing-library/no-node-access */

const findSmartLink = async (kind: string) => {
  const link = await screen.findByTestId("smart-link");
  await waitFor(() => expect(link).toHaveAttribute("data-smart-link", kind));
  return link;
};

describe("AIMarkdown", () => {
  beforeEach(() => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
  });

  it.each([
    {
      href: "metabase://question/123",
      kind: "link",
      resolvedHref: "/question/123-test-question",
    },
    {
      href: "metabase://metric/456",
      kind: "token",
      resolvedHref: "/metric/456",
    },
    { href: "/table/5", kind: "token", resolvedHref: "/table/5-orders" },
  ])("renders $href as a smart $kind", async ({ href, kind, resolvedHref }) => {
    setup({ children: `See [Name](${href})` });

    const link = await findSmartLink(kind);
    expect(link).toHaveAttribute("href", resolvedHref);
  });

  it("should render other internal links unchanged", async () => {
    setup({ children: "See [Settings](/admin/settings)" });

    const link = await screen.findByRole("link", { name: "Settings" });
    expect(link).toHaveAttribute("href", "/admin/settings");
    expect(screen.queryByTestId("smart-link")).not.toBeInTheDocument();
  });

  it("shows a hover card with the entity details for a Library token", async () => {
    setup({ children: "[Orders](/table/5)" });

    await userEvent.hover(await findSmartLink("token"));

    const card = await screen.findByTestId("metabot-hover-card");
    expect(card).toHaveTextContent("Table");
    expect(card).toHaveTextContent("Orders");
    expect(card).toHaveTextContent("Confirmed orders");
    expect(await within(card).findByText("2")).toBeInTheDocument();
    expect(card).toHaveTextContent("fields");
    expect(
      await within(card).findByRole("link", { name: "Library" }),
    ).toHaveAttribute("href", "/collection/6464-library");
    expect(within(card).getByRole("link", { name: "Data" })).toHaveAttribute(
      "href",
      "/collection/10-data",
    );
  });

  it("does not show a hover card for a plain link", async () => {
    setup({ children: "[My Question](metabase://question/123)" });

    await userEvent.hover(await findSmartLink("link"));

    expect(screen.queryByTestId("metabot-hover-card")).not.toBeInTheDocument();
  });

  it("should render a generated-chart mention as a smart link chip", async () => {
    setup(
      { children: "[Orders by month](metabase://chart/chart-1)" },
      {
        conversationCharts: {
          "chart-1": {
            queries: [createMockStructuredDatasetQuery()],
            visualization_settings: { chart_type: "bar" },
          },
        },
      },
    );

    expect(await screen.findByText("Orders by month")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Orders by month/ }),
    ).toHaveAttribute("href", expect.stringContaining("/question#"));
  });

  it("should still render the chart mention chip when the chart is not in conversation state", async () => {
    setup({ children: "[Orders by month](metabase://chart/chart-1)" });

    expect(await screen.findByText("Orders by month")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
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

  it("should not render images (SEC-505)", async () => {
    setup({
      children: `start ![remote](https://example.com/cat.png) ![data](data:image/png;base64,iVBORw0KGgo=) end`,
    });

    expect(await screen.findByText(/start/)).toBeInTheDocument();
    expect(screen.getByText(/end/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("should not render images while streaming (SEC-505)", async () => {
    setup({
      children: `start ![remote](https://example.com/cat.png) ![data](data:image/png;base64,iVBORw0KGgo=) end`,
      isStreaming: true,
    });

    expect(await screen.findByText(/start/)).toBeInTheDocument();
    expect(screen.getByText(/end/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
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

  it("should render a single className root even when split into blocks", async () => {
    const { container } = setup({
      children: "para one\n\npara two\n\npara three",
      className: "message-bubble",
      isStreaming: true,
    });

    await waitFor(() =>
      expect(renderedText(container)).toContain("para three"),
    );
    expect(countElements(container, ".message-bubble")).toBe(1);
  });

  describe("streaming", () => {
    it("should not animate when not streaming", () => {
      const { container } = setup({ children: "hello world" });
      expect(animatedWords(container)).toHaveLength(0);
    });

    it("should not animate words already visible when streaming began", () => {
      const { container } = setup({
        children: "hello world",
        isStreaming: true,
      });
      expect(animatedWords(container)).toHaveLength(0);
    });

    it("should animate only words appended after streaming began", async () => {
      const { container, rerender } = setup({
        children: "hello",
        isStreaming: true,
      });

      rerender(<AIMarkdown isStreaming>{"hello brave new world"}</AIMarkdown>);

      await waitFor(() =>
        expect(animatedWords(container)).toEqual(["brave", "new", "world"]),
      );
    });

    it("should render the exact source once streaming ends", async () => {
      const { container, rerender } = setup({
        children: "done **bold**",
        isStreaming: true,
      });

      rerender(<AIMarkdown isStreaming={false}>{"done **bold**"}</AIMarkdown>);

      await waitFor(() => expect(renderedText(container)).toBe("done bold"));
      expect(renderedText(container)).not.toContain("**");
    });

    it("should not leak repair artifacts from incomplete markdown", async () => {
      const { container } = setup({
        children: "streaming **bol",
        isStreaming: true,
      });

      await waitFor(() =>
        expect(renderedText(container)).toContain("streaming"),
      );
      expect(renderedText(container)).not.toContain("**");
      expect(hasElement(container, "strong")).toBe(true);
    });

    it("should not leak an emphasis marker inside a streaming list item", async () => {
      // Trailing space makes the list block end in a newline — the case remend mishandles.
      const { container } = setup({
        children: "- word then *emphasis ",
        isStreaming: true,
      });

      await waitFor(() => expect(hasElement(container, "li")).toBe(true));
      expect(container).not.toHaveTextContent(/\*/);
      expect(hasElement(container, "em")).toBe(true);
    });

    it("should not animate words inside links, code, or tables", async () => {
      const { container, rerender } = setup({
        children: "intro",
        isStreaming: true,
      });

      rerender(
        <AIMarkdown isStreaming>
          {
            "intro\n\n[a link](https://example.com)\n\n`inline`\n\n```\ncode here\n```"
          }
        </AIMarkdown>,
      );

      await waitFor(() => expect(hasElement(container, "a")).toBe(true));
      const animated = animatedWords(container).join(" ");
      expect(animated).not.toContain("link");
      expect(animated).not.toContain("inline");
      expect(animated).not.toContain("code");
    });
  });
});
