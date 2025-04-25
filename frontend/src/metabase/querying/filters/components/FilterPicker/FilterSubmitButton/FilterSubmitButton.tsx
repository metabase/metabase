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

  return (
    <Button.Group>
      <Button type="submit" variant="filled" disabled={isDisabled}>
        {t`Apply filter`}
      </Button>
      <Divider orientation="vertical" />
      <Tooltip label={t`Add another filter`}>
        <Button
          type="button"
          variant="filled"
          disabled={isDisabled}
          leftSection={<Icon name="add" />}
          onClick={onAddButtonClick}
        />
      </Tooltip>
    </Button.Group>
  );
}
