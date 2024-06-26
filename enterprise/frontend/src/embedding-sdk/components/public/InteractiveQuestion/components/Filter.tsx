import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context/context";
import { FilterContent } from "metabase/querying/components/FilterContent";
import { useFilterContent } from "metabase/querying/components/FilterModal";
import { Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const Filter = () => {
  const { question, onQueryChange, setIsFilterOpen } =
    useInteractiveQuestionContext();

  const onClose = () => {
    setIsFilterOpen(false);
  };

  return (
    question && (
      <FilterInner
        question={question}
        onQueryChange={onQueryChange}
        onClose={onClose}
      />
    )
  );
};

const FilterInner = ({
  question,
  onQueryChange,
  onClose,
}: {
  question: Question;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
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
    onClose();
    handleSubmit();
  };

  return (
    <Stack>
      <button onClick={onClose}>Close</button>
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
