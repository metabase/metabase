import { t } from "ttag";
import { useEffect, useState } from "react";
import Modal from "metabase/components/Modal";
import { SearchFilterModalFooter } from "metabase/search/components/SearchFilterModal/SearchFilterModalFooter";
import { SearchFilters } from "metabase/search/types";
import Button from "metabase/core/components/Button";
import { Flex, Title } from "metabase/ui";
import { SearchFilterDisplay } from "metabase/search/components/SearchFilterDisplay";
import { SearchFilterWrapper } from "./SearchFilterModal.styled";

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

  return isOpen ? (
    <Modal isOpen={isOpen} onClose={closeModal}>
      <SearchFilterWrapper data-testid="search-filter-modal-container">
        <Flex direction="row" justify="space-between" align="center">
          <Title order={4}>{t`Filter by`}</Title>
          <Button onlyIcon onClick={() => setIsOpen(false)} icon="close" />
        </Flex>
        <SearchFilterDisplay value={output} onChangeFilters={setOutput} />

        <SearchFilterModalFooter
          onApply={applyFilters}
          onCancel={closeModal}
          onClear={clearFilters}
        />
      </SearchFilterWrapper>
    </Modal>
  ) : null;
};
