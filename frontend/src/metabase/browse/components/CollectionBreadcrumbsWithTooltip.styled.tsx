import styled from "@emotion/styled";
import type { AnchorHTMLAttributes } from "react";

import { ResponsiveChild } from "metabase/components/ResponsiveContainer/ResponsiveContainer";
import { color } from "metabase/lib/colors";
import type { AnchorProps } from "metabase/ui";
import { Anchor, Group, FixedSizeIcon } from "metabase/ui";

import type { RefProp } from "./types";

export const Breadcrumb = styled(Anchor)<
  AnchorProps &
    AnchorHTMLAttributes<HTMLAnchorElement> &
    RefProp<HTMLAnchorElement>
>`
  color: ${color("text-dark")};
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-top: 1px;
  padding-bottom: 1px;
  :hover {
    color: ${color("brand")};
    text-decoration: none;
  }
`;

export const CollectionBreadcrumbsWrapper = styled(ResponsiveChild)`
  line-height: 1;
`;

export const BreadcrumbGroup = styled(Group)`
  flex-flow: row nowrap;
`;

export const CollectionsIcon = styled(FixedSizeIcon)`
  margin-inline-end: 0.5rem;
`;
