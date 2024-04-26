import userEvent from "@testing-library/user-event";

import { getIcon, render, screen, within } from "__support__/ui";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";

import { Scalar } from "./Scalar";

const series = (value = 1.23) => [
  {
    card: createMockCard({ display: "scalar" }),
    data: { rows: [[value]], cols: [createMockColumn({ name: "count" })] },
  },
];

const settings = {
  "scalar.field": "count",
  "card.title": "Scalar Title",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

describe("Scalar", () => {
  it("should render title on dashboards", () => {
    render(
      <Scalar
        series={series()}
        rawSeries={series()}
        settings={settings}
        isDashboard
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("Scalar Title")).toBeInTheDocument();
  });

  it("shouldn't render compact if normal formatting is <=6 characters", () => {
    render(
      <Scalar
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12,345")).toBeInTheDocument(); // with compact formatting, we'd have 1
  });

  it("should render description", async () => {
    const DESCRIPTION = "description";

    render(
      <Scalar
        series={series()}
        rawSeries={series()}
        settings={{ ...settings, "card.description": DESCRIPTION }}
        isDashboard
        visualizationIsClickable={() => false}
      />,
    );

    await userEvent.hover(getIcon("info_filled"));

    expect(screen.getByRole("tooltip")).toHaveTextContent(DESCRIPTION);
  });

  it("should render markdown in description", async () => {
    const DESCRIPTION = "[link](https://metabase.com)";

    render(
      <Scalar
        series={series()}
        rawSeries={series()}
        settings={{ ...settings, "card.description": DESCRIPTION }}
        isDashboard
        visualizationIsClickable={() => false}
      />,
    );

    await userEvent.hover(getIcon("info_filled"));

    expect(
      within(screen.getByRole("tooltip")).getByRole("link"),
    ).toHaveTextContent("link");
  });

  it("should render compact if normal formatting is >6 characters", () => {
    render(
      <Scalar
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12.3k")).toBeInTheDocument();
  });

  it("should render null", () => {
    render(
      <Scalar
        isDashboard // displays title
        series={series(null)}
        rawSeries={series(null)}
        settings={settings}
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("Scalar Title")).toBeInTheDocument(); // just confirms that it rendered
  });
});
