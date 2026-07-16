import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockCard } from "metabase-types/api/mocks";

import { AIMarkdown } from "./AIMarkdown";

const setup = (props: { children: string }) => {
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
    jest.mocked(navigator.clipboard.writeText).mockClear();
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

  it("should not render images", async () => {
    setup({
      children: `start ![remote](https://example.com/cat.png) ![data](data:image/png;base64,iVBORw0KGgo=) end`,
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
});
