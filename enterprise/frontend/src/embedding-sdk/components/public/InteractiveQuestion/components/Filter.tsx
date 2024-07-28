import cx from "classnames";

import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { FilterContent } from "metabase/querying/components/FilterContent";
import { useFilterContent } from "metabase/querying/components/FilterModal";
import { Box, Group, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type FilterProps = {
  onClose: () => void;
};

export const Filter = ({ onClose = () => {} }: Partial<FilterProps>) => {
  const { question } = useInteractiveQuestionContext();

  return question && <FilterInner question={question} onClose={onClose} />;
};

const FilterInner = ({
  question,
  onClose,
}: {
  question: Question;
} & FilterProps) => {
  const { onQuestionChange } = useInteractiveQuestionContext();

  const onQueryChange = (query: Lib.Query) =>
    onQuestionChange(question.setQuery(query));

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
      <Group position="right">
        <FilterContent.Header value={searchText} onChange={handleSearch} />
      </Group>
      <Box h="100%" className={cx(CS.flex1, CS.overflowHidden)}>
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
      </Box>
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
