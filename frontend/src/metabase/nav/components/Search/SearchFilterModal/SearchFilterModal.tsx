import { t } from "ttag";
import { useMemo, useState } from "react";
import Modal from "metabase/components/Modal";
import { SearchFilterModalFooter } from "metabase/nav/components/Search/SearchFilterModal/SearchFilterModalFooter";
import { FilterType } from "metabase/nav/components/Search/SearchFilterModal/types";
import { TypeFilter } from "./filters/TypeFilter";

export const SearchFilterModal = ({
  isOpen,
  setIsOpen,
  onApply,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onApply: (filters: { [key in FilterType]?: unknown }) => void;
}) => {
  const [output, setOutput] = useState<{ [key in FilterType]?: unknown }>({});

  const closeModal = () => {
    setIsOpen(false);
  };

  const clearFilters = () => {
    setOutput({});
    setIsOpen(false);
  };

  const availableFilters = useMemo(() => {
    return {
      [FilterType.Type]: TypeFilter,
    };
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title={t`Filter by`}>
      {Object.entries(availableFilters).map(([key, Filter]) => (
        <Filter
          key={key}
          value={output[key as FilterType]}
          onChange={val =>
            setOutput({
              ...output,
              [key]: val,
            })
          }
        />
      ))}
      <SearchFilterModalFooter
        onApply={() => onApply(output)}
        onCancel={closeModal}
        onClear={clearFilters}
      />
    </Modal>
  );
};
