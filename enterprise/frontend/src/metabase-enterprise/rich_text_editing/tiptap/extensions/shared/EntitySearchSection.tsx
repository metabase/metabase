import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Divider, Text } from "metabase/ui";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import {
  MenuItemComponent,
  SearchResultsFooter,
} from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import type { SearchResult } from "metabase-types/api";

interface EntitySearchSectionProps {
  canBrowseAll: boolean;
  menuItems: MenuItem[];
  selectedIndex: number;
  onItemSelect: (index: number) => void;
  onFooterClick: () => void;
  query: string;
  searchResults: SearchResult[];
  modal: "question-picker" | null;
  onModalSelect: (item: QuestionPickerValueItem) => void;
  onModalClose: () => void;
  onItemHover: (index: number) => void;
  selectedSearchModelName?: string;
}

export function EntitySearchSection({
  menuItems,
  selectedIndex,
  onItemSelect,
  onFooterClick,
  query,
  searchResults,
  modal,
  onModalSelect,
  onModalClose,
  onItemHover,
  selectedSearchModelName,
  canBrowseAll,
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

      {canBrowseAll && (
        <>
          {menuItems.length > 0 && <Divider my="sm" mx="sm" />}

          <SearchResultsFooter
            isSelected={selectedIndex === menuItems.length}
            onClick={onFooterClick}
            onMouseEnter={() => onItemHover(menuItems.length)}
          />

          {modal === "question-picker" && (
            <QuestionPickerModal
              onChange={onModalSelect}
              onClose={onModalClose}
            />
          )}
        </>
      )}
    </>
  );
}
