import { t } from "ttag";

import { Button, Divider, Icon, Tooltip } from "metabase/ui";

type FilterSubmitButtonProps = {
  isDisabled?: boolean;
  onAddButtonClick?: () => void;
};

export function FilterSubmitButton({
  isDisabled,
  onAddButtonClick,
}: FilterSubmitButtonProps) {
  const addButtonLabel = t`Add another filter`;
  return (
    <Button.Group>
      <Button type="submit" variant="filled" disabled={isDisabled}>
        {t`Add filter`}
      </Button>
      <Divider orientation="vertical" />
      <Tooltip label={addButtonLabel}>
        <Button
          type="button"
          variant="filled"
          disabled={isDisabled}
          leftSection={<Icon name="add" />}
          aria-label={addButtonLabel}
          onClick={onAddButtonClick}
        />
      </Tooltip>
    </Button.Group>
  );
}
