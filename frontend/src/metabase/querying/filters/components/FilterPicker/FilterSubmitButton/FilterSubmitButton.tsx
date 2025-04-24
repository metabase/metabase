import { t } from "ttag";

import { Button, Divider, Icon, Tooltip } from "metabase/ui";

import type { FilterChangeOpts } from "../types";

type FilterSubmitButtonProps = {
  isNew: boolean;
  isValid: boolean;
  withAddButton: boolean;
  onSubmit: (opts: FilterChangeOpts) => void;
};

export function FilterSubmitButton({
  isNew,
  isValid,
  withAddButton,
  onSubmit,
}: FilterSubmitButtonProps) {
  const handleApplyButtonClick = () => {
    onSubmit({ run: true });
  };

  const handleAddButtonClick = () => {
    onSubmit({ run: false });
  };

  if (!withAddButton) {
    return (
      <Button
        variant="filled"
        disabled={!isValid}
        onClick={handleApplyButtonClick}
      >
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    );
  }

  return (
    <Button.Group>
      <Button
        variant="filled"
        disabled={!isValid}
        onClick={handleApplyButtonClick}
      >
        {t`Apply filter`}
      </Button>
      <Divider orientation="vertical" />
      <Tooltip label={t`Add filter without running the query`}>
        <Button
          variant="filled"
          disabled={!isValid}
          leftSection={<Icon name="add" />}
          onClick={handleAddButtonClick}
        />
      </Tooltip>
    </Button.Group>
  );
}
