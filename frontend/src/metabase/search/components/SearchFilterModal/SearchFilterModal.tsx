import { t } from "ttag";
import { useEffect, useMemo, useState } from "react";
import Modal from "metabase/components/Modal";
import {
  SearchFilterComponent,
  SearchFilterType,
} from "metabase/search/components/SearchFilterModal/types";
import { SearchFilterModalFooter } from "metabase/search/components/SearchFilterModal/SearchFilterModalFooter";
import { TypeFilter } from "./filters/TypeFilter";

export const SearchFilterModal = ({
  isOpen,
  setIsOpen,
  value,
  onChangeFilters,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  value: SearchFilterType;
  onChangeFilters: (filters: SearchFilterType) => void;
}) => {
  const [output, setOutput] = useState<SearchFilterType>(value);

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

  const availableFilters: {
    type: SearchFilterComponent<"type">;
  } = useMemo(() => {
    return {
      type: TypeFilter,
    };
  }, []);

  return isOpen ? (
    <Modal isOpen={isOpen} onClose={closeModal} title={t`Filter by`}>
      {Object.entries(availableFilters).map(([key, Filter]) => (
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
      ))}
      <SearchFilterModalFooter
        onApply={applyFilters}
        onCancel={closeModal}
        onClear={clearFilters}
      />
    </Modal>
  ) : null;
};
