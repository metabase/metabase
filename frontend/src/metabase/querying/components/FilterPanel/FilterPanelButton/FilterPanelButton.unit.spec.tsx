import { render, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";

import { createQueryWithStringFilter } from "../../FilterPicker/test-utils";

import { FilterPanelButton } from "./FilterPanelButton";

const { query: initialQuery } = createQueryWithStringFilter();

interface SetupOpts {
  query: Lib.Query;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const setup = (props: SetupOpts = { query: initialQuery }) => {
  const { isExpanded = true } = props;
  const onExpand = jest.fn();
  const onCollapse = jest.fn();

  render(
    <FilterPanelButton
      isExpanded={isExpanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      {...props}
    />,
  );
};

describe("FilterPanelButton", () => {
  it("should render icon on the left", () => {
    setup();

    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
  });
});
