import { t } from "ttag";

import type { TransformId } from "metabase-types/api";
import { Link } from "metabase/common/components/Link";
import { Button, type ButtonProps } from "metabase/ui";
import { transformEdit } from "metabase/urls";

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
