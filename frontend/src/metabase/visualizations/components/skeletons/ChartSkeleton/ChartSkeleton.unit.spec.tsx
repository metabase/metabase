import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDisplayType } from "metabase-types/api";
import ChartSkeleton, { ChartSkeletonProps } from "./ChartSkeleton";

const MockActionMenu = <div>Action Menu</div>;

const chartSkeletonDisplayTypes: CardDisplayType[] = [
  "area",
  "bar",
  "funnel",
  "gauge",
  "line",
  "map",
  "object",
  "pivot",
  "table",
  "pie",
  "progress",
  "row",
  "scalar",
  "scatter",
  "smartscalar",
  "waterfall",
];

const displayTestData = [
  {
    name: "Empty",
    display: undefined,
  },
  {
    name: "Random display type",
    display: "a display type",
  },
  ...chartSkeletonDisplayTypes.map((display: CardDisplayType) => ({
    name: display,
    display,
  })),
];

const setup = ({
  display,
  name,
  description,
  actionMenu,
}: ChartSkeletonProps) => {
  render(
    <ChartSkeleton
      display={display}
      name={name}
      description={description}
      actionMenu={actionMenu}
    />,
  );
};
describe("ChartSkeleton", () => {
  beforeAll(() => {
    jest.unmock("metabase/components/Popover");
  });

  displayTestData.forEach(({ name, display }) => {
    const displayDescription = `${name} description`;

    it(`should render ${name} visualization`, () => {
      setup({ name, display });
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.queryByLabelText("info icon")).not.toBeInTheDocument();
    });

    it(`should render ${name} visualization with description`, () => {
      setup({ name, description: displayDescription, display });
      userEvent.hover(screen.getByLabelText("info icon"));
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByText(displayDescription)).toBeInTheDocument();
    });

    it(`should render ${name} visualization with description and action menu`, () => {
      setup({
        name,
        description: displayDescription,
        actionMenu: MockActionMenu,
        display,
      });
      userEvent.hover(screen.getByLabelText("info icon"));
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByText(displayDescription)).toBeInTheDocument();
      expect(screen.getByText("Action Menu")).toBeInTheDocument();
    });
  });
});
