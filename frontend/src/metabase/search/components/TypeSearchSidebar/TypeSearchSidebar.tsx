import { t } from "ttag";
import { Flex } from "@mantine/core";
import { IconName } from "metabase/core/components/Icon";
import { TypeSidebarButton } from "metabase/search/components/TypeSearchSidebar/TypeSearchSidebar.styled";
import { SearchModelType } from "metabase-types/api";

const SEARCH_FILTERS: {
  name: string;
  icon: IconName;
  filter: SearchModelType;
}[] = [
  {
    name: t`Apps`,
    filter: "app",
    icon: "star",
  },
  {
    name: t`Dashboards`,
    filter: "dashboard",
    icon: "dashboard",
  },
  {
    name: t`Collections`,
    filter: "collection",
    icon: "folder",
  },
  {
    name: t`Databases`,
    filter: "database",
    icon: "database",
  },
  {
    name: t`Models`,
    filter: "dataset",
    icon: "model",
  },
  {
    name: t`Raw Tables`,
    filter: "table",
    icon: "table",
  },
  {
    name: t`Questions`,
    filter: "card",
    icon: "bar",
  },
  {
    name: t`Pulses`,
    filter: "pulse",
    icon: "pulse",
  },
  {
    name: t`Metrics`,
    filter: "metric",
    icon: "sum",
  },
  {
    name: t`Segments`,
    filter: "segment",
    icon: "segment",
  },
];

export const TypeSearchSidebar = ({
  availableModels,
  selectedType = null,
  onSelectType,
}: {
  availableModels: SearchModelType[];
  selectedType: SearchModelType | null;
  onSelectType: (type: SearchModelType | null) => void;
}) => {
  const searchModels = [
    {
      name: t`All items`,
      icon: "search",
      filter: null,
    },
    ...SEARCH_FILTERS.filter(({ filter }) => availableModels.includes(filter)),
  ];

  return (
    <Flex
      data-testid="type-sidebar"
      gap={"sm"}
      align={"flex-start"}
      justify={"center"}
      direction={"column"}
    >
      {searchModels.map(({ name, icon, filter }) => {
        return (
          <TypeSidebarButton
            data-testid="type-sidebar-item"
            key={name}
            onClick={() => onSelectType(filter)}
            icon={icon}
            iconSize={16}
            isActive={filter === selectedType}
          >
            <h4>{name}</h4>
          </TypeSidebarButton>
        );
      })}
    </Flex>
  );
};
