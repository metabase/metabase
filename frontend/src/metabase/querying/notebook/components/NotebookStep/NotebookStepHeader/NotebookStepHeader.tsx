import cx from "classnames";
import { t } from "ttag";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import CS from "metabase/css/core/index.css";
import { Flex, Icon } from "metabase/ui";

import type { NotebookStepHeaderProps } from "../../../types";

export function NotebookStepHeader({
  title,
  color,
  canRevert,
  onRevert,
}: NotebookStepHeaderProps) {
  return (
    <Flex c={color} fw="bold" mb="sm">
      {title}
      {canRevert && (
        <IconButtonWrapper
          className={cx(
            CS.mlAuto,
            CS.textLight,
            CS.textMediumHover,
            CS.hoverChild,
          )}
          onClick={onRevert}
        >
          <Icon name="close" tooltip={t`Remove`} aria-label={t`Remove step`} />
        </IconButtonWrapper>
      )}
    </Flex>
  );
}
