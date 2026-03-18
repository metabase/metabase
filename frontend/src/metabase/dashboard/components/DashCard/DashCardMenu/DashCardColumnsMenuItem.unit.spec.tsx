import { render, screen } from "@testing-library/react";
import { useEffect } from "react";

import { renderWithProviders } from "__support__/ui";
import {
  TransientColumnVisibilityProvider,
  useTransientColumnVisibility,
} from "metabase/dashboard/components/DashCard/TransientColumnVisibilityContext";

import { DashCardColumnsMenuItem } from "./DashCardColumnsMenuItem";

const TEST_COLUMNS = [
  { id: "col_a", name: "Column A" },
  { id: "col_b", name: "Column B" },
  { id: "col_c", name: "Column C" },
];

/**
 * Helper component that seeds the context with columns before rendering the
 * menu item, mimicking what TableInteractive does at runtime.
 */
const ColumnsMenuWithSetup = ({
  columns = TEST_COLUMNS,
  hiddenIds = [] as string[],
}: {
  columns?: Array<{ id: string; name: string }>;
  hiddenIds?: string[];
}) => {
  const ctx = useTransientColumnVisibility();

  useEffect(() => {
    if (ctx) {
      ctx.setAllColumns(columns);
      hiddenIds.forEach(id => ctx.hideColumn(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DashCardColumnsMenuItem />;
};

const setup = ({
  columns,
  hiddenIds,
}: {
  columns?: Array<{ id: string; name: string }>;
  hiddenIds?: string[];
} = {}) => {
  return renderWithProviders(
    <TransientColumnVisibilityProvider>
      <ColumnsMenuWithSetup columns={columns} hiddenIds={hiddenIds} />
    </TransientColumnVisibilityProvider>,
  );
};

describe("DashCardColumnsMenuItem", () => {
  it("should render nothing when outside the context provider", () => {
    const { container } = render(<DashCardColumnsMenuItem />);
    expect(container).toBeEmptyDOMElement();
  });

  it("should render nothing when no columns are registered", () => {
    const { container } = render(
      <TransientColumnVisibilityProvider>
        <DashCardColumnsMenuItem />
      </TransientColumnVisibilityProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("should render 'Columns' menu item when columns are registered", () => {
    setup();
    expect(screen.getByText("Columns")).toBeInTheDocument();
  });

  it("should render 'Columns' menu item even when no columns are hidden", () => {
    setup({ hiddenIds: [] });
    expect(screen.getByText("Columns")).toBeInTheDocument();
  });
});
