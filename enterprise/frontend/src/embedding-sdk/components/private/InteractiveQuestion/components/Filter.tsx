import cx from "classnames";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { FilterModalBody } from "metabase/querying/filters/components/FilterModal/FilterModalBody";
import { FilterModalFooter } from "metabase/querying/filters/components/FilterModal/FilterModalFooter";
import { FilterModalHeader } from "metabase/querying/filters/components/FilterModal/FilterModalHeader";
import { useFilterModal } from "metabase/querying/filters/hooks/use-filter-modal";
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
  const { updateQuestion } = useInteractiveQuestionContext();

  const onQueryChange = (query: Lib.Query) =>
    updateQuestion(question.setQuery(query), { run: true });

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
  } = useFilterModal(question, onQueryChange);

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
        <FilterModalHeader value={searchText} onChange={handleSearch} />
      </Group>
      <Box h="100%" className={cx(CS.flex1, CS.overflowHidden)}>
        <FilterModalBody
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
        <FilterModalFooter
          canRemoveFilters={canRemoveFilters}
          onClearFilters={onClearFilters}
          isChanged={isChanged}
          onApplyFilters={onApplyFilters}
        />
      </Group>
    </Stack>
  );
};
