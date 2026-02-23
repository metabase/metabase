import { forwardRef } from "react";

import type { IconName } from "metabase/ui";
import { Flex, Icon, Text } from "metabase/ui";

import S from "./MetricResultItem.module.css";

type MetricResultItemProps = {
  name: string;
  slug?: string;
  icon?: IconName;
  active?: boolean;
  onClick?: () => void;
};

export const MetricResultItem = forwardRef<HTMLDivElement, MetricResultItemProps>(
  function MetricResultItem(
    { name, slug, icon = "metric", active = false, onClick },
    ref,
  ) {
    return (
      <Flex
        ref={ref}
        px="sm"
        py="xs"
        align="center"
        gap="xs"
        mih={36}
        c="text-primary"
        className={S.resultItem}
        data-active={active || undefined}
        onClick={onClick}
      >
        <Icon name={icon} c="text-tertiary" flex="0 0 auto" />
        <Text lh="md" lineClamp={1} flex="1">
          {name}
        </Text>
        {slug && (
          <Text fz="xs" c="text-tertiary" flex="0 0 auto">
            {slug}
          </Text>
        )}
      </Flex>
    );
  },
);
