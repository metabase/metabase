import styled from "@emotion/styled";

import { ResponsiveChild } from "metabase/components/ResponsiveContainer/ResponsiveContainer";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { FixedSizeIcon, Flex, Group } from "metabase/ui";

import { Ellipsis } from "./Ellipsis";

/** When a cell is narrower than this width, breadcrumbs within it change significantly */
const breadcrumbBreakpoint = "10rem";

export const Breadcrumb = styled(ResponsiveChild)<{
  maxWidth: string;
  isSoleBreadcrumb: boolean;
  index: number;
}>`
  ${({ maxWidth }) => {
    return maxWidth ? `td & { max-width: ${maxWidth} };` : "";
  }}
  color: ${color("text-dark")};
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-top: 1px;
  padding-bottom: 1px;
  ${props => {
    return `
    @container ${props.containerName} (width < ${breadcrumbBreakpoint}) {
      ${props.index === 0 && !props.isSoleBreadcrumb ? `display: none;` : ""}
      td & { max-width: calc(95cqw - ${props.isSoleBreadcrumb ? 1 : 3}rem); };
    }`;
  }}
`;

export const CollectionLink = styled(Link)`
  :hover {
    &,
    * {
      color: var(--mb-color-brand);

      .collection-path-separator {
        color: var(--mb-color-brand-alpha-88);
      }
    }
  }
`;

export const InitialEllipsis = styled(Ellipsis)``;
InitialEllipsis.defaultProps = {
  includeSep: false,
};

export const CollectionBreadcrumbsWrapper = styled(ResponsiveChild)`
  line-height: 1;
  ${InitialEllipsis} {
    display: none;
  }
  ${props => {
    return `
    @container ${props.containerName} (width < ${breadcrumbBreakpoint}) {
      ${EllipsisAndSeparator} {
        display: none;
      }
      ${InitialEllipsis} {
        display: inline;
      }
    }
    `;
  }}
`;

export const BreadcrumbGroup = styled(Group)`
  flex-flow: row nowrap;
`;

export const CollectionsIcon = styled(FixedSizeIcon)`
  margin-inline-end: 0.5rem;
`;

export const EllipsisAndSeparator = styled(Flex)``;
