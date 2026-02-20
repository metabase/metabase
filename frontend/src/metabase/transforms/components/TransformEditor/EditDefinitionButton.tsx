import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { transformEdit } from "metabase/lib/urls";
import { Button, type ButtonProps } from "metabase/ui";
import type { TransformId } from "metabase-types/api";

type EditDefinitionButtonProps = {
  transformId: TransformId;
} & Omit<ButtonProps, "component" | "onLoad">;

export const EditDefinitionButton = ({
  transformId,
  ...buttonProps
}: EditDefinitionButtonProps) => {
  return (
    <Link data-testid="edit-definition-button" to={transformEdit(transformId)}>
      <Button style={{ flexShrink: 0 }} {...buttonProps}>
        {t`Edit definition`}
      </Button>
    </Link>
  );
};
