import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Divider, Text } from "metabase/ui";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import {
  CreateNewQuestionFooter,
  MenuItemComponent,
  SearchResultsFooter,
} from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import { CreateQuestionModal } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/CreateQuestionModal";
import type { SearchResult } from "metabase-types/api";

interface EntitySearchSectionProps {
  menuItems: MenuItem[];
  selectedIndex: number;
  onItemSelect: (index: number) => void;
  onFooterClick: () => void;
  query: string;
  searchResults: SearchResult[];
  modal: "question-picker" | "new-question-type" | null;
  onModalSelect: (item: QuestionPickerValueItem) => void;
  onModalClose: () => void;
  onItemHover: (index: number) => void;
  canBrowseAll?: boolean;
  selectedSearchModelName?: string;
  onTriggerCreateNew: () => void;
  onSaveNewQuestion: (id: number, name: string) => void;
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
  onTriggerCreateNew,
  onSaveNewQuestion,
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

      <Divider my="sm" mx="sm" />
      {query.length > 0 &&
      menuItems.length === 0 &&
      searchResults.length === 0 ? (
        <Box p="sm" ta="center">
          <Text size="md" c="text-medium">{t`No results found`}</Text>
        </Box>
      ) : null}
      <CreateNewQuestionFooter
        isSelected={selectedIndex === menuItems.length}
        onClick={onTriggerCreateNew}
        onMouseEnter={() => onItemHover(menuItems.length)}
      />
      {modal === "new-question-type" && (
        <CreateQuestionModal
          onSave={onSaveNewQuestion}
          onClose={onModalClose}
        />
      )}

      {canBrowseAll && (
        <>
          <SearchResultsFooter
            isSelected={selectedIndex === menuItems.length + 1}
            onClick={onFooterClick}
            onMouseEnter={() => onItemHover(menuItems.length + 1)}
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
