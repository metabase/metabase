import { t } from "ttag";
import { useEffect, useMemo, useState } from "react";
import _ from "underscore";
import Modal from "metabase/components/Modal";
import { SearchFilterModalFooter } from "metabase/search/components/SearchFilterModal/SearchFilterModalFooter";
import {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchFilterPropTypes,
  SearchFilters,
} from "metabase/search/types";
import Button from "metabase/core/components/Button";
import { Title, Flex } from "metabase/ui";
import { SearchFilterKeys } from "metabase/search/constants";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { SearchFilterWrapper } from "./SearchFilterModal.styled";
import { TypeFilter, VerifiedFilter } from "./filters";

const filterMap: Record<FilterTypeKeys, SearchFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
  [SearchFilterKeys.Verified]: VerifiedFilter,
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

  const onOutputChange = (
    key: FilterTypeKeys,
    val: SearchFilterPropTypes[FilterTypeKeys],
  ) => {
    if (!val || (Array.isArray(val) && val.length === 0)) {
      setOutput(_.omit(output, key));
    } else {
      setOutput({
        ...output,
        [key]: val,
      });
    }
  };

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
    const filters: FilterTypeKeys[] = [SearchFilterKeys.Type];
    if (PLUGIN_CONTENT_VERIFICATION.isEnabled()) {
      filters.push(SearchFilterKeys.Verified);
    }
    return filters;
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
              onChange={value => onOutputChange(key, value)}
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
