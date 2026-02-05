import { t } from "ttag";

import { Button } from "metabase/ui";

type DefaultSubmitButtonProps = {
  isDisabled?: boolean;
};

export function renderDefaultSubmitButton({
  isDisabled,
}: DefaultSubmitButtonProps = {}) {
  return (
    <Button type="submit" variant="filled" disabled={isDisabled}>
      {t`Apply`}
    </Button>
  );
}
