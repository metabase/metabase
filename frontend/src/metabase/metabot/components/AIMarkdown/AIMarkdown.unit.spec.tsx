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
});
