import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Divider, Text } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import type { MenuItem } from "../../shared/MenuComponents";
import {
  MenuItemComponent,
  SearchResultsFooter,
} from "../../shared/MenuComponents";

interface EntitySearchSectionProps {
  menuItems: MenuItem[];
  selectedIndex: number;
  onItemSelect: (index: number) => void;
  onFooterClick: () => void;
  query: string;
  searchResults: SearchResult[];
  modal: "question-picker" | null;
  onModalSelect: (item: QuestionPickerValueItem) => void;
  onModalClose: () => void;
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
}: EntitySearchSectionProps) {
  return (
    <>
      {menuItems.map((item, index) => (
        <MenuItemComponent
          key={index}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => onItemSelect(index)}
        />
      ))}
      {query.length > 0 && searchResults.length === 0 ? (
        <Box p="sm" ta="center">
          <Text size="sm" c="dimmed">{t`No results found`}</Text>
        </Box>
      ) : null}
      <Divider my="sm" mx="sm" />
      <SearchResultsFooter
        isSelected={selectedIndex === menuItems.length}
        onClick={onFooterClick}
      />

      {modal === "question-picker" && (
        <QuestionPickerModal onChange={onModalSelect} onClose={onModalClose} />
      )}
    </>
  );
}
