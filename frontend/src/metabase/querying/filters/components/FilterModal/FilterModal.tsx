import { Flex, FocusTrap, Modal } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useFilterModal } from "../../hooks/use-filter-modal";

import S from "./FilterModal.module.css";
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
    remountKey,
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
          <Modal.Header className={S.ModalHeader} p="lg">
            <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
            <FocusTrap.InitialFocus />
            <Flex mx="md" justify="end" style={{ flex: 1 }}>
              <FilterSearchInput
                value={searchText}
                onChange={onSearchTextChange}
              />
            </Flex>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body className={S.ModalBody} p={0}>
            <FilterModalBody
              /**
               * Force-remount to re-initialize the state of descendant components and their hooks.
               * Kicks in when changing search query or clearing all filters.
               *
               * @see https://github.com/metabase/metabase/issues/48319
               */
              key={remountKey}
            />
          </Modal.Body>
          <Flex
            className={S.ModalFooter}
            p="md"
            direction="row"
            justify="space-between"
          >
            <FilterModalFooter
              canRemoveFilters={canRemoveFilters}
              onClearFilters={onReset}
              isChanged={isChanged}
              onApplyFilters={onSubmitFilters}
            />
          </Flex>
        </Modal.Content>
      </Modal.Root>
    </FilterModalProvider>
  );
}
