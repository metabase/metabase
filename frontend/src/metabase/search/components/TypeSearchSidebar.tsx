import { t } from "ttag";
import cx from "classnames";
import { Flex } from "@mantine/core";
import { SearchModelType } from "metabase-types/api";
import { Icon, IconName } from "metabase/core/components/Icon";
import Button from "metabase/core/components/Button";

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
  selectedType,
  onSelectType
}: {
  availableModels: Array<SearchModelType | "app">;
  selectedType: SearchModelType | "app" | null;
  onSelectType: (type?: SearchModelType | "app") => void;
}) => {
  const searchModels: {
    name: string;
    filter?: SearchModelType | "app";
    icon: IconName;
  }[] = [
    {
      name: t`All items`,
      icon: "search",
      filter: undefined,
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
          <Button
            key={name}
            className={cx(
              (!selectedType || selectedType === filter) ? "text-brand" : "text-medium",
            )}
            onClick={() => onSelectType(filter)}
          >
            <Flex
              gap={"xs"}
              direction={"row"}
              justify={"center"}
              align={"flex-start"}
            >
              <Icon name={icon} size={16} />
              <h4>{name}</h4>
            </Flex>
          </Button>
        );
      })}
    </Flex>
  );
};
