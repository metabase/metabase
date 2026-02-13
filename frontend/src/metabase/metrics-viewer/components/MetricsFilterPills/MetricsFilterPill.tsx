import type { HTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import type { IconName } from "metabase/ui";
import { Flex, Icon } from "metabase/ui";

import S from "./MetricsFilterPill.module.css";

interface MetricsFilterPillProps extends HTMLAttributes<HTMLDivElement> {
  icon: IconName;
  iconColor: string;
  onRemoveClick?: () => void;
}

export const MetricsFilterPill = forwardRef(function MetricsFilterPill(
  {
    children,
    icon,
    iconColor,
    onRemoveClick,
    ...props
  }: MetricsFilterPillProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleRemoveClick = (event: MouseEvent) => {
    event.stopPropagation();
    onRemoveClick?.();
  };

  return (
    <Flex
      {...props}
      ref={ref}
      className={S.root}
      align="center"
      gap="sm"
      px="sm"
      lh="1.5rem"
    >
      <Icon name={icon} size={14} c={iconColor} className={S.icon} />
      {children}
      {onRemoveClick && (
        <Icon
          className={S.removeIcon}
          name="close"
          size={12}
          role="button"
          aria-label={t`Remove`}
          onClick={handleRemoveClick}
        />
      )}
    </Flex>
  );
});
