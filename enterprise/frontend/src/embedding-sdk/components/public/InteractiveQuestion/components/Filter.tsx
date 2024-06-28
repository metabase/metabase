import { FilterContent } from "metabase/querying/components/FilterContent";
import { useFilterContent } from "metabase/querying/components/FilterModal";
import { Group, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionData } from "../hooks";

export const Filter = ({
  onApply = () => {},
  onClear = () => {},
}: {
  onApply?: () => void;
  onClear?: () => void;
}) => {
  const { question } = useInteractiveQuestionData();

  return (
    question && (
      <FilterInner question={question} onApply={onApply} onClear={onClear} />
    )
  );
};

const FilterInner = ({
  question,
  onApply,
  onClear,
}: {
  question: Question;
  onApply: () => void;
  onClear: () => void;
}) => {
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
    onApply();
  };

  const onClearFilters = () => {
    handleReset();
    onClear();
  };

  return (
    <Stack>
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
