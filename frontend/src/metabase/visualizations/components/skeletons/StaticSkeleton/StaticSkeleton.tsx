import type { HTMLAttributes, ReactNode } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { Box, Ellipsified, Group, Icon, Tooltip, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./StaticSkeleton.module.css";

export interface StaticSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  nameRightSection?: ReactNode;
  description?: string | null;
  icon?: StaticSkeletonIconProps;
  tooltip?: string;
}

export interface StaticSkeletonIconProps {
  name: IconName;
  iconUrl?: string;
}

const StaticSkeleton = ({
  name,
  nameRightSection,
  description,
  icon,
  tooltip,
  ...props
}: StaticSkeletonProps): JSX.Element => {
  const defaultedDescription = description || "";

  return (
    <Box pos="relative" {...props}>
      {icon && (
        <Tooltip label={tooltip} disabled={!tooltip}>
          <Box
            className={S.iconContainer}
            pos="relative"
            w="xl"
            mt="sm"
            mb="lg"
          >
            <EntityIcon
              {...icon}
              size="1.5rem"
              // Use the raw CSS var rather than the `text-secondary` ColorName
              // so Loki visual snapshots resolve it via stylesheets instead of
              // inlining a theme value that differs between runs.
              color="var(--mb-color-text-secondary)"
              style={{ display: "block" }}
            />
            {tooltip && (
              <Box
                className={S.tooltipIconContainer}
                pos="absolute"
                right={-8}
                bottom={-8}
                p="xxxs"
                bg="background_page-primary"
              >
                <Icon
                  className={S.tooltipIcon}
                  name="eye_crossed_out"
                  size={12}
                  display="block"
                />
              </Box>
            )}
          </Box>
        </Tooltip>
      )}
      <Group gap="0.5rem">
        <Ellipsified c="text-primary" fw="bold">
          {name}
        </Ellipsified>
        {nameRightSection}
      </Group>

      <Box c="text-secondary" lh={rem(24)}>
        <MarkdownPreview>{defaultedDescription}</MarkdownPreview>
      </Box>
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticSkeleton;
