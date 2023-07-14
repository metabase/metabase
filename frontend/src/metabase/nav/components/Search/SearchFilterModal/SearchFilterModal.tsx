import { t } from "ttag";
import Modal from "metabase/components/Modal";
import { SearchFilterModalFooter } from "metabase/nav/components/Search/SearchFilterModal/SearchFilterModalFooter";
import { TypeFilter } from "./filters/TypeFilter";

export const SearchFilterModal = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  const closeModal = () => {
    setIsOpen(false);
  };

  const applyFilters = () => {
    setIsOpen(false);
  };

  const clearFilters = () => {
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={t`Filter by`}
    >
      <TypeFilter />
      <SearchFilterModalFooter
        onApply={applyFilters}
        onCancel={closeModal}
        onClear={clearFilters}
      />
    </Modal>
  );
};
