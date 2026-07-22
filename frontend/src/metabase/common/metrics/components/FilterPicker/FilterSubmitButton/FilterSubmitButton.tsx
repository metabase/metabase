import { t } from "ttag";

import { Button } from "metabase/ui";

type FilterSubmitButtonProps = {
  isNew?: boolean;
  isDisabled?: boolean;
};

export function FilterSubmitButton({
  isNew,
  isDisabled,
}: FilterSubmitButtonProps) {
  return (
    <Button type="submit" variant="filled" disabled={isDisabled}>
      {isNew ? t`Add filter` : t`Update filter`}
    </Button>
  );
}
