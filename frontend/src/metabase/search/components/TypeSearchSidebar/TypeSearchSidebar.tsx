import { t } from "ttag";
import { Flex } from "@mantine/core";
import { SearchModelType } from "metabase-types/api";
import { IconName } from "metabase/core/components/Icon";
import { TypeSidebarButton } from "metabase/search/components/TypeSearchSidebar.styled";

const SEARCH_FILTERS: Array<{
  name: string;
  filter: SearchModelType | "app";
  icon: IconName;
}> = [
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
  availableModels: Array<SearchModelType | "app">;
  selectedType: SearchModelType | "app" | null;
  onSelectType: (type: SearchModelType | "app" | null) => void;
}) => {
  const searchModels: {
    name: string;
    filter: SearchModelType | "app" | null;
    icon: IconName;
  }[] = [
    {
      name: t`All items`,
      icon: "search",
      filter: null,
    },
    ...SEARCH_FILTERS.filter(({ filter }) => availableModels.includes(filter)),
  ];

  return (
    <Flex
      gap={"sm"}
      align={"flex-start"}
      justify={"center"}
      direction={"column"}
    >
      {searchModels.map(({ name, icon, filter }) => {
        return (
          <TypeSidebarButton
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
