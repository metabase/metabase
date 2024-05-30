import styled from "@emotion/styled";
import type { AnchorHTMLAttributes } from "react";

import { ResponsiveChild } from "metabase/components/ResponsiveContainer/ResponsiveContainer";
import { color } from "metabase/lib/colors";
import type { AnchorProps } from "metabase/ui";
import { Anchor, FixedSizeIcon, Group } from "metabase/ui";

import type { RefProp } from "./types";

export const Breadcrumb = styled(Anchor)<
  AnchorProps &
    AnchorHTMLAttributes<HTMLAnchorElement> &
    RefProp<HTMLAnchorElement>
>`
  color: var(--mb-color-text-dark);
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-top: 1px;
  padding-bottom: 1px;
  :hover {
    color: var(--mb-color-brand);
    text-decoration: none;
  }
`;

export const CollectionBreadcrumbsWrapper = styled(ResponsiveChild)`
  line-height: 1;
  ${props => {
    const breakpoint = "10rem";
    return `
    .initial-ellipsis {
      display: none;
    }
    @container ${props.containerName} (width < ${breakpoint}) {
      .ellipsis-and-separator {
        display: none;
      }
      .initial-ellipsis {
        display: inline;
      }
      .for-index-0:not(.sole-breadcrumb) {
        display: none;
      }
      .breadcrumb {
        max-width: calc(95cqw - 3rem) ! important;
      }
      .sole-breadcrumb {
        max-width: calc(95cqw - 1rem) ! important;
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
