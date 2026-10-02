import cx from "classnames";
import type { ButtonHTMLAttributes, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { ActionIcon, type ActionIconProps, Icon } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";

import S from "../DashCard.module.css";

export type DashCardMenuButtonProps = ActionIconProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export const DashCardMenuButton = forwardRef(function DashCardMenuButton(
  { className, ...props }: DashCardMenuButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <ActionIcon
      ref={ref}
      aria-label={t`More options`}
      size="xs"
      {...props}
      className={cx(
        S.DashCardMenuButton,
        SAVING_DOM_IMAGE_HIDDEN_CLASS,
        className,
      )}
    >
      <Icon name="ellipsis" size={12} />
    </ActionIcon>
  );
});
