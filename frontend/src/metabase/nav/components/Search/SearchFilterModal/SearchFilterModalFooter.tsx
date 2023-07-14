import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { Flex, Group } from "metabase/ui";

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
    <Flex
      direction={"row"}
      justify={"space-between"}
      align={"center"}
      style={{ width: "100%" }}
    >
      <Button borderless onClick={onClear}>{t`Clear all filters`}</Button>
      <Group>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button primary onClick={onApply}>{t`Apply all filters`}</Button>
      </Group>
    </Flex>
  );
};
