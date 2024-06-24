import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  FilterSearchInput,
  TabContent,
} from "metabase/querying/components/FilterContent";
import { Button, Modal } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterEmptyState } from "./FilterEmptyState";
import { ModalBody, ModalFooter, ModalHeader } from "./FilterModal.styled";
import { SEARCH_KEY } from "./constants";
import {
  appendStageIfAggregated,
  getGroupItems,
  hasFilters,
  removeFilters,
} from "./utils/filters";
import { getModalTitle, getModalWidth } from "./utils/modal";
import { isSearchActive, searchGroupItems } from "./utils/search";

export interface FilterModalProps {
  query: Lib.Query;
  onSubmit: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export function FilterModal({
  query: initialQuery,
  onSubmit,
  onClose,
}: FilterModalProps) {
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
    onClose();
  };

  const handleSearch = (searchText: string) => {
    setTab(isSearchActive(searchText) ? SEARCH_KEY : groupItems[0]?.key);
    setSearchText(searchText);
  };

  return (
    <Modal.Root opened size={getModalWidth(groupItems)} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <ModalHeader p="lg">
          <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
          <FilterSearchInput searchText={searchText} onChange={handleSearch} />
          <Modal.CloseButton />
        </ModalHeader>
        <ModalBody p={0}>
          {visibleItems.length > 0 ? (
            <TabContent
              query={query}
              groupItems={visibleItems}
              tab={tab}
              version={version}
              isSearching={isSearching}
              onChange={handleChange}
              onInput={handleInput}
              onTabChange={setTab}
            />
          ) : (
            <FilterEmptyState />
          )}
        </ModalBody>
        <ModalFooter p="md" direction="row" justify="space-between">
          <Button
            variant="subtle"
            color="text-medium"
            disabled={!canRemoveFilters}
            onClick={handleReset}
          >
            {t`Clear all filters`}
          </Button>
          <Button
            variant="filled"
            disabled={!isChanged}
            data-testid="apply-filters"
            onClick={handleSubmit}
          >
            {t`Apply filters`}
          </Button>
        </ModalFooter>
      </Modal.Content>
    </Modal.Root>
  );
}
