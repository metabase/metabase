import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ChartSkeletonDisplayType,
  chartSkeletonDisplayTypes,
} from "metabase/visualizations/components/skeletons/util/display-type";
import ChartSkeleton, { ChartSkeletonProps } from "./ChartSkeleton";

jest.unmock("metabase/components/Popover");

const ActionMenu = <div>Action Menu</div>;

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

const displayTestData = [
  {
    name: "Empty",
    display: undefined,
  },
  ...chartSkeletonDisplayTypes.map((display: ChartSkeletonDisplayType) => ({
    name: display,
    display,
  })),
];

describe("ChartSkeleton", () => {
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

    it(`should render ${display} visualization with description and action menu`, () => {
      setup({
        name,
        description: displayDescription,
        actionMenu: ActionMenu,
        display,
      });
      userEvent.hover(screen.getByLabelText("info icon"));
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByText(displayDescription)).toBeInTheDocument();
      expect(screen.getByText("Action Menu")).toBeInTheDocument();
    });
  });
});
