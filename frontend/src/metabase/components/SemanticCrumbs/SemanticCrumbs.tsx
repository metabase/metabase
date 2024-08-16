import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";

import {
  BrowserCrumbsItem,
  SemanticCrumbsLink,
  BrowserCrumbsRoot,
  StyledCrumb,
} from "./SemanticCrumbs.styled";
import { BreadcrumbsPathSeparator } from "metabase/nav/components/CollectionBreadcrumbs/CollectionBreadcrumbs.styled";
import { CollectionsIcon } from "metabase/browse/components/CollectionBreadcrumbsWithTooltip.styled";

// TODO: merge with Breadcrumbs

const Crumb = ({ children }: { children: ReactNode }) => (
  <StyledCrumb className={cx(CS.textUppercase, CS.textMedium)}>
    {children}
  </StyledCrumb>
);

type BrowserCrumbsType = {
  crumbs: {
    title: string | ReactNode;
    to?: string;
  }[];
};

export const SemanticCrumbs = ({ crumbs }: BrowserCrumbsType) => (
  <BrowserCrumbsRoot data-testid="browsercrumbs">
    {crumbs
      .filter(c => c)
      .map((crumb, index, crumbs) => (
        <BrowserCrumbsItem key={index}>
          {crumb.to ? (
            <>
            <CollectionsIcon name="folder" />
            <SemanticCrumbsLink to={crumb.to}>
              <Crumb>{crumb.title}</Crumb>
            </SemanticCrumbsLink>
            </>
          ) : (
            <>
            <CollectionsIcon name="folder" />
            <Crumb>{crumb.title}</Crumb>
            </>
          )}
          {index < crumbs.length - 1 ? (
            <BreadcrumbsPathSeparator>/</BreadcrumbsPathSeparator>
          ) : null}
        </BrowserCrumbsItem>
      ))}
  </BrowserCrumbsRoot>
);
