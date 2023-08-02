import { t } from "ttag";
import { useEffect, useMemo, useState } from "react";
import Modal from "metabase/components/Modal";
import { SearchFilterModalFooter } from "metabase/search/components/SearchFilterModal/SearchFilterModalFooter";
import {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchFilterKeys,
  SearchFilters,
} from "metabase/search/types";
import Button from "metabase/core/components/Button";
import { Title, Flex } from "metabase/ui";
import { TypeFilter } from "./filters/TypeFilter";
import { SearchFilterWrapper } from "./SearchFilterModal.styled";

const filterMap: Record<FilterTypeKeys, SearchFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
};

export const SearchFilterModal = ({
  isOpen,
  setIsOpen,
  value,
  onChangeFilters,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  value: SearchFilters;
  onChangeFilters: (filters: SearchFilters) => void;
}) => {
  const [output, setOutput] = useState<SearchFilters>(value);

  useEffect(() => {
    setOutput(value);
  }, [value]);

  const closeModal = () => {
    setIsOpen(false);
  };

  const clearFilters = () => {
    onChangeFilters({});
    setIsOpen(false);
  };

  const applyFilters = () => {
    onChangeFilters(output);
    setIsOpen(false);
  };

  // we can use this field to control which filters are available
  // - we can enable the 'verified' filter here
  const availableFilters: FilterTypeKeys[] = useMemo(() => {
    return [SearchFilterKeys.Type];
  }, []);

  return isOpen ? (
    <Modal isOpen={isOpen} onClose={closeModal}>
      <SearchFilterWrapper data-testid="search-filter-modal-container">
        <Flex direction="row" justify="space-between" align="center">
          <Title order={4}>{t`Filter by`}</Title>
          <Button onlyIcon onClick={() => setIsOpen(false)} icon="close" />
        </Flex>
        {availableFilters.map(key => {
          const Filter = filterMap[key];
          return (
            <Filter
              key={key}
              data-testid={`${key}-search-filter`}
              value={output[key]}
              onChange={val =>
                setOutput({
                  ...output,
                  [key]: val,
                })
              }
            />
          );
        })}

        <SearchFilterModalFooter
          onApply={applyFilters}
          onCancel={closeModal}
          onClear={clearFilters}
        />
      </SearchFilterWrapper>
    </Modal>
  ) : null;
};
