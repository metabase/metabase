import { useState } from "react";
import { IconName } from "metabase/core/components/Icon";
import { TypeSearchSidebar } from "metabase/search/components/TypeSearchSidebar/TypeSearchSidebar";
import { screen, render, within } from "__support__/ui";
import { SearchModelType } from "metabase-types/api";

type TypeSearchSidebarSetupProps = {
  initSelectedType?: SearchModelType | null;
};

const TEST_TYPES: {
  name: string;
  icon: IconName;
  filter: SearchModelType;
}[] = [
  {
    name: "Apps",
    filter: "app",
    icon: "star",
  },
  {
    name: "Dashboards",
    filter: "dashboard",
    icon: "dashboard",
  },
  {
    name: "Collections",
    filter: "collection",
    icon: "folder",
  },
  {
    name: "Databases",
    filter: "database",
    icon: "database",
  },
  {
    name: "Models",
    filter: "dataset",
    icon: "model",
  },
  {
    name: "Raw Tables",
    filter: "table",
    icon: "table",
  },
  {
    name: "Questions",
    filter: "card",
    icon: "bar",
  },
  {
    name: "Pulses",
    filter: "pulse",
    icon: "pulse",
  },
  {
    name: "Metrics",
    filter: "metric",
    icon: "sum",
  },
  {
    name: "Segments",
    filter: "segment",
    icon: "segment",
  },
];

const TEST_ALL_ITEMS_TYPE = {
  name: "All items",
  filter: null,
  icon: "search",
};

const TEST_ALL_TYPES = [TEST_ALL_ITEMS_TYPE, ...TEST_TYPES];

const TestTypeSearchSidebarComponent = ({
  initSelectedType = null,
}: TypeSearchSidebarSetupProps) => {
  const [selectedType, onSelectType] = useState(initSelectedType);

  return (
    <div>
      <div data-testid="selected-element">{selectedType}</div>
      <div data-testid="sidebar">
        <TypeSearchSidebar
          availableModels={TEST_TYPES.map(({ filter }) => filter)}
          onSelectType={onSelectType}
          selectedType={selectedType}
        />
      </div>
    </div>
  );
};

const setup = ({ initSelectedType }: TypeSearchSidebarSetupProps = {}) => {
  render(
    <TestTypeSearchSidebarComponent initSelectedType={initSelectedType} />,
  );
};

describe("TypeSearchSidebar", () => {
  it("display the correct text and icon for each type", () => {
    setup();
    const sidebar = within(screen.getByTestId("sidebar"));
    TEST_ALL_TYPES.forEach(({ name, icon }) => {
      expect(sidebar.getByText(name)).toBeInTheDocument();
      expect(sidebar.getByLabelText(`${icon} icon`)).toBeInTheDocument();
    });
  });

  it("should select the correct type when clicking on it", () => {
    setup();
    const sidebar = within(screen.getByTestId("sidebar"));
    TEST_TYPES.forEach(({ name, filter }) => {
      sidebar.getByText(name).click();
      expect(screen.getByTestId("selected-element")).toHaveTextContent(filter);
    });

    sidebar.getByText(TEST_ALL_ITEMS_TYPE.name).click();
    expect(screen.getByTestId("selected-element")).toBeEmptyDOMElement();
  });
});
