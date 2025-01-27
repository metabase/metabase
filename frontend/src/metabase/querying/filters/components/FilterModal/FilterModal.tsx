import { Flex, Modal } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useFilterModal } from "../../hooks/use-filter-modal";

import { ModalBody, ModalFooter, ModalHeader } from "./FilterModal.styled";
import { FilterModalBody } from "./FilterModalBody";
import { FilterModalFooter } from "./FilterModalFooter";
import { FilterSearchInput } from "./FilterSearchInput";
import { FilterModalProvider } from "./context";
import { getModalTitle, getModalWidth } from "./utils";

export interface FilterModalProps {
  question: Question;
  onSubmit: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export function FilterModal({
  question,
  onSubmit: onSubmitProp,
  onClose,
}: FilterModalProps) {
  const filterModal = useFilterModal(question, onSubmitProp);
  const {
    canRemoveFilters,
    groupItems,
    isChanged,
    searchText,
    onReset,
    onSearchTextChange,
    onSubmit,
  } = filterModal;

  const onSubmitFilters = () => {
    onSubmit();
    onClose();
  };

  return (
    <FilterModalProvider value={filterModal}>
      <Modal.Root opened size={getModalWidth(groupItems)} onClose={onClose}>
        <Modal.Overlay />
        <Modal.Content>
          <ModalHeader p="lg">
            <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
            <Flex mx="md" justify="end" style={{ flex: 1 }}>
              <FilterSearchInput
                value={searchText}
                onChange={onSearchTextChange}
              />
            </Flex>
            <Modal.CloseButton />
          </ModalHeader>
          <ModalBody p={0}>
            <FilterModalBody />
          </ModalBody>
          <ModalFooter p="md" direction="row" justify="space-between">
            <FilterModalFooter
              canRemoveFilters={canRemoveFilters}
              onClearFilters={onReset}
              isChanged={isChanged}
              onApplyFilters={onSubmitFilters}
            />
          </ModalFooter>
        </Modal.Content>
      </Modal.Root>
    </FilterModalProvider>
  );
}
