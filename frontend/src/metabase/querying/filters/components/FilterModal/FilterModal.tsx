import { Box, Flex, Modal } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useFilterModal } from "../../hooks/use-filter-modal";

import { FieldGroupPicker } from "./FieldGroupPicker";
import S from "./FilterModal.module.css";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "./FilterModal.styled";
import { FilterModalBody } from "./FilterModalBody";
import { FilterModalFooter } from "./FilterModalFooter";
import { FilterSearchInput } from "./FilterModalHeader/FilterSearchInput";
import { getModalTitle, getModalWidth } from "./utils";

export interface FilterModalProps {
  question: Question;
  onSubmit: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export function FilterModal({ question, onSubmit, onClose }: FilterModalProps) {
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
  } = useFilterModal(question, onSubmit);

  const onSubmitFilters = () => {
    handleSubmit();
    onClose();
  };

  return (
    <Modal.Root opened size={getModalWidth(groupItems)} onClose={onClose}>
      <Modal.Overlay />

      <ModalContent>
        <ModalHeader p={48} pt="xl" pb="md">
          <Box w="100%">
            <Flex justify="space-between" mb="md" style={{ flex: 1 }}>
              <Modal.Title>{getModalTitle(groupItems)}</Modal.Title>
              <Modal.CloseButton className={S.close} />
            </Flex>

            <Box mb="md">
              <FilterSearchInput
                className={S.search}
                searchText={searchText}
                onChange={handleSearch}
              />
            </Box>

            {groupItems.length > 1 && (
              <FieldGroupPicker
                groupItems={groupItems}
                value={tab}
                onChange={setTab}
              />
            )}
          </Box>
        </ModalHeader>

        <ModalBody p={0}>
          <FilterModalBody
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
          <FilterModalFooter
            canRemoveFilters={canRemoveFilters}
            onClearFilters={handleReset}
            isChanged={isChanged}
            onApplyFilters={onSubmitFilters}
          />
        </ModalFooter>
      </ModalContent>
    </Modal.Root>
  );
}
