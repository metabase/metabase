import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useWorktreeId } from "metabase/common/worktrees";
import { Button, type ButtonProps } from "metabase/ui";
import { transformEdit } from "metabase/urls";
import type { TransformId } from "metabase-types/api";

type EditDefinitionButtonProps = {
  transformId: TransformId;
} & ButtonProps;

export const EditDefinitionButton = ({
  transformId,
  ...buttonProps
}: EditDefinitionButtonProps) => {
  const worktreeId = useWorktreeId();
  return (
    <Button
      component={Link}
      data-testid="edit-definition-button"
      style={{ flexShrink: 0 }}
      to={transformEdit(transformId, { worktreeId })}
      {...buttonProps}
    >
      {t`Edit definition`}
    </Button>
  );
};
