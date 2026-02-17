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
    <Button
      component={Link}
      data-testid="edit-definition-button"
      style={{ flexShrink: 0 }}
      to={transformEdit(transformId)}
      {...buttonProps}
    >
      {t`Edit definition`}
    </Button>
  );
};
