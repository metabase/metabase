import type { HTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { IconName } from "metabase/ui";
import { Flex, Icon, Text } from "metabase/ui";

import S from "./MetricsFilterPill.module.css";

interface MetricsFilterPillProps extends HTMLAttributes<HTMLDivElement> {
  colors: string[];
  fallbackIcon: IconName;
  onRemoveClick?: () => void;
}

export const MetricsFilterPill = forwardRef(function MetricsFilterPill(
  {
    children,
    colors,
    fallbackIcon,
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
      gap="xs"
      px="sm"
      h={24}
    >
      <SourceColorIndicator
        colors={colors}
        fallbackIcon={fallbackIcon}
        size={12}
      />
      <Text c="saturated-purple" fz="sm">
        {children}
      </Text>
      {onRemoveClick && (
        <Icon
          c="saturated-purple"
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
