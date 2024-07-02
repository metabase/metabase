import { useMemo, useState } from "react";

import { FilterContent } from "metabase/querying/components/FilterContent";
import { Flex, Modal } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ModalBody, ModalFooter, ModalHeader } from "./FilterModal.styled";
import { SEARCH_KEY } from "./constants";
import {
  appendStageIfAggregated,
  getGroupItems,
  hasFilters,
  removeFilters,
  getModalTitle,
  getModalWidth,
  isSearchActive,
  searchGroupItems,
} from "./utils";

export interface FilterModalProps {
  query: Lib.Query;
  onSubmit: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export const useFilterContent = (
  initialQuery: Lib.Query,
  onSubmit: (newQuery: Lib.Query) => void,
) => {
  const [query, setQuery] = useState(() =>
    appendStageIfAggregated(initialQuery),
  );
  const [version, setVersion] = useState(1);
  const [isChanged, setIsChanged] = useState(false);
  const groupItems = useMemo(() => getGroupItems(query), [query]);
  const [tab, setTab] = useState<string | null>(groupItems[0]?.key);
  const canRemoveFilters = useMemo(() => hasFilters(query), [query]);
  const [searchText, setSearchText] = useState("");
  const isSearching = isSearchActive(searchText);

  const visibleItems = useMemo(
    () => (isSearching ? searchGroupItems(groupItems, searchText) : groupItems),
    [groupItems, searchText, isSearching],
  );

  const handleInput = () => {
    if (!isChanged) {
      setIsChanged(true);
    }
  };

  const handleChange = (newQuery: Lib.Query) => {
    setQuery(newQuery);
    setIsChanged(true);
  };

  const handleReset = () => {
    setQuery(removeFilters(query));
    setVersion(version + 1);
    setIsChanged(true);
  };

  const handleSubmit = () => {
    onSubmit(Lib.dropEmptyStages(query));
  };

  const handleSearch = (searchText: string) => {
    setTab(isSearchActive(searchText) ? SEARCH_KEY : groupItems[0]?.key);
    setSearchText(searchText);
  };
  return {
    query,
    version,
    isChanged,
    groupItems,
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
  };
};

export function FilterModal({
  query: initialQuery,
  onSubmit,
  onClose,
}: FilterModalProps) {
  const {
    query,
    version,
    isChanged,
    groupItems,
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
  } = useFilterContent(initialQuery, onSubmit);

  const onSubmitFilters = () => {
    handleSubmit();
    onClose();
  };

  return (
    <Modal.Root opened size={getModalWidth(groupItems)} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <ModalHeader p="lg">
          <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
          <Flex mx="md" justify="end" style={{ flex: 1 }}>
            <FilterContent.Header value={searchText} onChange={handleSearch} />
          </Flex>
          <Modal.CloseButton />
        </ModalHeader>
        <ModalBody p={0}>
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
        </ModalBody>
        <ModalFooter p="md" direction="row" justify="space-between">
          <FilterContent.Footer
            canRemoveFilters={canRemoveFilters}
            onClearFilters={handleReset}
            isChanged={isChanged}
            onApplyFilters={onSubmitFilters}
          />
        </ModalFooter>
      </Modal.Content>
    </Modal.Root>
  );
}
