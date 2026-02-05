import { t } from "ttag";

import { Button } from "metabase/ui";

type FilterSubmitButtonProps = {
  isDisabled?: boolean;
};

export function FilterSubmitButton({ isDisabled }: FilterSubmitButtonProps) {
  return (
    <Button type="submit" variant="filled" disabled={isDisabled}>
      {t`Apply filter`}
    </Button>
  );
}
