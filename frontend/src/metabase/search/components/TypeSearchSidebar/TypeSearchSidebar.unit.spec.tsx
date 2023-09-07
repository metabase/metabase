import { useState } from "react";
import type { IconName } from "metabase/core/components/Icon";
import { TypeSearchSidebar } from "metabase/search/components/TypeSearchSidebar/TypeSearchSidebar";
import { screen, render, within } from "__support__/ui";
import type { SearchModelType } from "metabase-types/api";

const TEST_TYPES: {
  name: string;
  icon: IconName;
  filter: SearchModelType;
}[] = [
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
  name: "All results",
  filter: null,
  icon: "search",
};

const TEST_ALL_TYPES = [TEST_ALL_ITEMS_TYPE, ...TEST_TYPES];

const TestTypeSearchSidebarComponent = ({
  initSelectedType = null,
  onChange,
}: {
  initSelectedType: SearchModelType | null;
  onChange: jest.Mock;
}) => {
  const [selectedType, onSelectType] = useState(initSelectedType);
  onChange.mockImplementation(onSelectType);

  return (
    <TypeSearchSidebar
      availableModels={TEST_TYPES.map(({ filter }) => filter)}
      onSelectType={onChange}
      selectedType={selectedType}
    />
  );
};

const setup = ({ initSelectedType = null } = {}) => {
  const onChange = jest.fn();
  render(
    <TestTypeSearchSidebarComponent
      initSelectedType={initSelectedType}
      onChange={onChange}
    />,
  );

  return { onChange };
};

describe("TypeSearchSidebar", () => {
  it("display all available models with the correct text and icon for each type", () => {
    setup();
    const sidebar = within(screen.getByTestId("type-sidebar"));
    TEST_ALL_TYPES.forEach(({ name, icon }) => {
      expect(sidebar.getByText(name)).toBeInTheDocument();
      expect(sidebar.getByLabelText(`${icon} icon`)).toBeInTheDocument();
    });
  });

  it("should select the correct type when clicking on it", () => {
    const { onChange } = setup();
    const sidebar = within(screen.getByTestId("type-sidebar"));
    TEST_TYPES.forEach(({ name, filter }) => {
      sidebar.getByText(name).click();
      expect(onChange).toHaveBeenCalledWith(filter);
    });

    sidebar.getByText(TEST_ALL_ITEMS_TYPE.name).click();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
