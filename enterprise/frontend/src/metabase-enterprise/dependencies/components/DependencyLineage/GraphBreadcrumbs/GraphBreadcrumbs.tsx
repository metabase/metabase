import { Fragment } from "react";
import { Link } from "react-router";

import { Box, Group, Icon } from "metabase/ui";

import type { NodeLocation } from "../types";

import S from "./GraphBreadcrumbs.module.css";

type GraphBreadcrumbsProps = {
  location: NodeLocation;
  withIcon?: boolean;
};

export function GraphBreadcrumbs({
  location,
  withIcon,
}: GraphBreadcrumbsProps) {
  return (
    <Group c="text-secondary" gap="sm" wrap="nowrap">
      {withIcon && <Icon name={location.icon} />}
      <Group fz="sm" gap="xs">
        {location.parts.map((part, partIndex) => (
          <Fragment key={partIndex}>
            {partIndex > 0 && <Box>/</Box>}
            <Box
              className={S.link}
              component={Link}
              to={part.url}
              target="_blank"
              lh="1rem"
            >
              {part.label}
            </Box>
          </Fragment>
        ))}
      </Group>
    </Group>
  );
}
