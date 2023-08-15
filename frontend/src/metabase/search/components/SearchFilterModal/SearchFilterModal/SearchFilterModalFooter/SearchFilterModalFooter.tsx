import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { Flex, Group } from "metabase/ui";
import { CloseAllFiltersButton } from "metabase/search/components/SearchFilterModal/SearchFilterModal/SearchFilterModalFooter/SearchFilterModalFooter.styled";

type SearchFilterModalFooterProps = {
  onApply: () => void;
  onCancel: () => void;
  onClear: () => void;
};

export const SearchFilterModalFooter = ({
  onApply,
  onCancel,
  onClear,
}: SearchFilterModalFooterProps) => {
  return (
    <Flex direction={"row"} justify={"space-between"} align={"center"}>
      <CloseAllFiltersButton
        onClick={onClear}
      >{t`Clear all filters`}</CloseAllFiltersButton>
      <Group>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary onClick={onApply}>{t`Apply all filters`}</Button>
      </Group>
    </Flex>
  );
};
