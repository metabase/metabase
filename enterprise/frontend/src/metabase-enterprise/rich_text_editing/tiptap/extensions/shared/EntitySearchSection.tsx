import { t } from "ttag";

import { Box, Text } from "metabase/ui";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import { MenuItemComponent } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import type { SearchResult } from "metabase-types/api";

interface EntitySearchSectionProps {
  menuItems: MenuItem[];
  selectedIndex: number;
  onItemSelect: (index: number) => void;
  query: string;
  searchResults: SearchResult[];
  onItemHover: (index: number) => void;
  selectedSearchModelName?: string;
}

export function EntitySearchSection({
  menuItems,
  selectedIndex,
  onItemSelect,
  query,
  searchResults,
  onItemHover,
  selectedSearchModelName,
}: EntitySearchSectionProps) {
  return (
    <>
      {selectedSearchModelName && (
        <Box py="xs">
          <Text size="sm" c="text-light" fw="bold">
            {selectedSearchModelName}
          </Text>
        </Box>
      )}
      {menuItems.map((item, index) => (
        <MenuItemComponent
          key={index}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => onItemSelect(index)}
          onMouseEnter={() => onItemHover(index)}
        />
      ))}
      {query.length > 0 &&
      menuItems.length === 0 &&
      searchResults.length === 0 ? (
        <Box p="sm" ta="center">
          <Text size="md" c="text-medium">{t`No results found`}</Text>
        </Box>
      ) : null}
    </>
  );
}
