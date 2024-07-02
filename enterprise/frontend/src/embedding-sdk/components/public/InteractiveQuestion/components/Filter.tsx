import { FilterContent } from "metabase/querying/components/FilterContent";
import { useFilterContent } from "metabase/querying/components/FilterModal";
import { Group, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionData } from "../hooks";

type FilterProps = {
  onClose: () => void;
};

export const Filter = ({ onClose = () => {} }: Partial<FilterProps>) => {
  const { question } = useInteractiveQuestionData();

  return question && <FilterInner question={question} onClose={onClose} />;
};

const FilterInner = ({
  question,
  onClose,
}: {
  question: Question;
} & FilterProps) => {
  const { onQueryChange } = useInteractiveQuestionData();

  const {
    query,
    version,
    isChanged,
    tab,
    setTab,
    canRemoveFilters,
    searchText,
    isSearching,
    visibleItems,
    handleInput,
    handleChange,
    handleReset,
    handleSubmit,
    handleSearch,
  } = useFilterContent(question.query(), onQueryChange);

  const onApplyFilters = () => {
    handleSubmit();
    onClose();
  };

  const onClearFilters = () => {
    handleReset();
    onClose();
  };

  return (
    <Stack w="100%" h="100%">
      <FilterContent.Header value={searchText} onChange={handleSearch} />
      <FilterContent.Body
        groupItems={visibleItems}
        query={query}
        tab={tab}
        version={version}
        searching={isSearching}
        onChange={handleChange}
        onInput={handleInput}
        onTabChange={setTab}
      />
      <Group>
        <FilterContent.Footer
          canRemoveFilters={canRemoveFilters}
          onClearFilters={onClearFilters}
          isChanged={isChanged}
          onApplyFilters={onApplyFilters}
        />
      </Group>
    </Stack>
  );
};
