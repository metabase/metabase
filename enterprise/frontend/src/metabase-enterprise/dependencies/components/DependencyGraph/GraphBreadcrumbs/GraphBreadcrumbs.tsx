import { Fragment } from "react";
import { Link } from "react-router";

import { Box, Group, type GroupProps } from "metabase/ui";

import type { NodeLink } from "../../../types";

import S from "./GraphBreadcrumbs.module.css";

type GraphBreadcrumbsProps = GroupProps & {
  location: NodeLink[];
};

export function GraphBreadcrumbs({
  location,
  ...props
}: GraphBreadcrumbsProps) {
  return (
    <Group c="text-secondary" gap="sm" wrap="nowrap" {...props}>
      <Group fz="sm" gap="xs">
        {location.map((part, partIndex) => (
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
