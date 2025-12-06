import { Link } from "react-router";
import { t } from "ttag";

import { transformEdit } from "metabase/lib/urls";
import { Button, type ButtonProps } from "metabase/ui";
import type { TransformId } from "metabase-types/api";

type EditDefinitionButtonProps = {
  transformId: TransformId;
} & ButtonProps;

export const EditDefinitionButton = ({
  transformId,
  ...buttonProps
}: EditDefinitionButtonProps) => {
  return (
    <Button component={Link} to={transformEdit(transformId)} {...buttonProps}>
      {t`Edit definition`}
    </Button>
  );
};
