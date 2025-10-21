import { Fragment } from "react";
import { Link } from "react-router";

import { Box, Group, Icon } from "metabase/ui";

import type { NodeLocation } from "../types";

import S from "./GraphNodeLocation.module.css";

type GraphNodeLocationProps = {
  location: NodeLocation;
  withIcon?: boolean;
};

export function GraphNodeLocation({
  location,
  withIcon,
}: GraphNodeLocationProps) {
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
            >
              {part.label}
            </Box>
          </Fragment>
        ))}
      </Group>
    </Group>
  );
}
