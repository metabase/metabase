import { useInteractiveQuestionData } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { FilterContent } from "metabase/querying/components/FilterContent";
import { useFilterContent } from "metabase/querying/components/FilterModal";
import { Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const Filter = () => {
  const { question, onQueryChange } = useInteractiveQuestionData();

  return (
    question && (
      <FilterInner question={question} onQueryChange={onQueryChange} />
    )
  );
};

const FilterInner = ({
  question,
  onQueryChange,
}: {
  question: Question;
  onQueryChange: (query: Lib.Query) => void;
}) => {
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
      <FilterContent.Footer
        canRemoveFilters={canRemoveFilters}
        onClearFilters={handleReset}
        isChanged={isChanged}
        onApplyFilters={onApplyFilters}
      />
    </Stack>
  );
};
