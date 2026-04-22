import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { IconName } from "metabase/ui";
import { Flex, Pill, Text } from "metabase/ui";

import S from "./MetricsFilterPill.module.css";

interface MetricsFilterPillProps extends HTMLAttributes<HTMLDivElement> {
  colors: string[];
  fallbackIcon?: IconName;
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
  return (
    <Pill
      {...props}
      ref={ref}
      className={S.root}
      size="xs"
      h="lg"
      px="sm"
      withRemoveButton={!!onRemoveClick}
      onRemove={onRemoveClick}
      removeButtonProps={{
        mr: 0,
        "aria-label": t`Remove`,
      }}
    >
      <Flex
        align="center"
        gap="xs"
        h="1.25rem"
        data-testid="metrics-viewer-filter-pill"
      >
        <SourceColorIndicator
          colors={colors}
          fallbackIcon={fallbackIcon}
          size={12}
        />
        <Text c="text-filter" fz="sm">
          {children}
        </Text>
      </Flex>
    </Pill>
  );
});
