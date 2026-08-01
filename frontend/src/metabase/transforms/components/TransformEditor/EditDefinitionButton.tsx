import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useTransformHost } from "metabase/transforms/host";
import { Button, type ButtonProps } from "metabase/ui";
import type { TransformId } from "metabase-types/api";

type EditDefinitionButtonProps = {
  transformId: TransformId;
} & ButtonProps;

export const EditDefinitionButton = ({
  transformId,
  ...buttonProps
}: EditDefinitionButtonProps) => {
  const { getTransformEditUrl } = useTransformHost();

  return (
    <Button
      component={Link}
      data-testid="edit-definition-button"
      style={{ flexShrink: 0 }}
      to={getTransformEditUrl(transformId)}
      {...buttonProps}
    >
      {t`Edit definition`}
    </Button>
  );
};
