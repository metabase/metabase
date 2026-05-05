import cx from "classnames";
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
    onClick,
    onRemoveClick,
    ...props
  }: MetricsFilterPillProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Pill
      {...props}
      ref={ref}
      className={cx(S.root, !!onClick && S.clickable)}
      size="xs"
      h="lg"
      px="sm"
      fw="normal"
      data-testid="metrics-viewer-filter-pill"
      withRemoveButton={!!onRemoveClick}
      onRemove={onRemoveClick}
      onClick={onClick}
      removeButtonProps={{
        mr: 0,
        "aria-label": t`Remove`,
        "aria-hidden": false,
        c: "text-filter",
      }}
    >
      <Flex align="center" gap="xs" h="1.25rem">
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
