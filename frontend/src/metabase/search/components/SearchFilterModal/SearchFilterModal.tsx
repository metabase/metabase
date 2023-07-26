import { t } from "ttag";
import { useEffect, useMemo, useState } from "react";
import Modal from "metabase/components/Modal";
import { SearchFilterModalFooter } from "metabase/search/components/SearchFilterModal/SearchFilterModalFooter";
import {
  FilterType,
  SearchFilterComponent,
  SearchFilterKeys,
  SearchFilters,
} from "metabase/search/util/filter-types";
import { TypeFilter } from "./filters/TypeFilter";

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

  const filterMap: Record<FilterType, SearchFilterComponent> = {
    type: TypeFilter,
  };

  const availableFilters: FilterType[] = useMemo(() => {
    return [SearchFilterKeys.Type];
  }, []);

  return isOpen ? (
    <Modal isOpen={isOpen} onClose={closeModal} title={t`Filter by`}>
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
    </Modal>
  ) : null;
};
