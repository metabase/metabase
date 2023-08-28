import { t } from "ttag";
import { Flex } from "metabase/ui";
import { TypeSidebarButton } from "metabase/search/components/TypeSearchSidebar/TypeSearchSidebar.styled";
import type { SearchModelType } from "metabase-types/api";
import { SEARCH_FILTERS } from "metabase/search/constants";

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
      name: t`All results`,
      icon: "search",
      filter: null,
    },
    ...SEARCH_FILTERS.filter(({ filter }) => availableModels.includes(filter)),
  ];

  return (
    <Flex
      data-testid="type-sidebar"
      align={"flex-start"}
      justify={"center"}
      direction={"column"}
      pt="1rem"
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
