import { t } from "ttag";

import { Button, Divider, Icon, Tooltip } from "metabase/ui";

type FilterSubmitButtonProps = {
  isNew?: boolean;
  isDisabled?: boolean;
  withAddButton?: boolean;
  onAddButtonClick?: () => void;
};

export function FilterSubmitButton({
  isNew,
  isDisabled,
  withAddButton,
  onAddButtonClick,
}: FilterSubmitButtonProps) {
  if (!withAddButton) {
    return (
      <Button type="submit" variant="filled" disabled={isDisabled}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    );
  }

  const addButtonLabel = t`Add another filter`;
  return (
    <Button.Group>
      <Button type="submit" variant="filled" disabled={isDisabled}>
        {t`Apply filter`}
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
