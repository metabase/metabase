import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";

import {
  BrowserCrumbsItem,
  SemanticCrumbsLink,
  BrowserCrumbsRoot,
  StyledCrumb,
} from "./SettingsCrumbs.styled"; // Adjust the path based on your project structure
import { BreadcrumbsPathSeparator } from "metabase/nav/components/CollectionBreadcrumbs/CollectionBreadcrumbs.styled";

// Component for rendering individual crumb
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

// Main SettingsCrumbs component
export const SettingsCrumbs = ({ crumbs }: BrowserCrumbsType) => (
  <BrowserCrumbsRoot data-testid="browsercrumbs">
    {crumbs
      .filter(c => c) // Ensure no empty crumbs
      .map((crumb, index, crumbs) => (
        <BrowserCrumbsItem key={index}>
          {crumb.to ? (
            <>
              <SemanticCrumbsLink to={crumb.to}>
                <Crumb>{crumb.title}</Crumb>
              </SemanticCrumbsLink>
            </>
          ) : (
            <>
              <Crumb>{crumb.title}</Crumb>
            </>
          )}
          {index < crumbs.length - 1 ? (
            <BreadcrumbsPathSeparator>{`>`}</BreadcrumbsPathSeparator>
          ) : null}
        </BrowserCrumbsItem>
      ))}
  </BrowserCrumbsRoot>
);
