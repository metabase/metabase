import cx from "classnames";
import { Fragment } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { Box, Group, type GroupProps } from "metabase/ui";

import type { NodeLink } from "../../../types";

import S from "./GraphBreadcrumbs.module.css";

type GraphBreadcrumbsProps = GroupProps & {
  links: NodeLink[];
};

export function GraphBreadcrumbs({ links, ...props }: GraphBreadcrumbsProps) {
  return (
    <Group c="text-secondary" gap="sm" wrap="nowrap" {...props}>
      <Group fz="sm" gap="xs">
        {links.map((link, linkIndex) => (
          <Fragment key={linkIndex}>
            {linkIndex > 0 && <Box>/</Box>}
            <Box
              className={cx(S.link, CS.textWrap)}
              component={Link}
              to={link.url}
              target="_blank"
              lh="1rem"
            >
              {link.label}
            </Box>
          </Fragment>
        ))}
      </Group>
    </Group>
  );
}
