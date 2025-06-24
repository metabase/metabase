import cx from "classnames";

import CS from "metabase/css/core/index.css";

import {
  BrowserCrumbsIcon,
  BrowserCrumbsItem,
  BrowserCrumbsLink,
  BrowserCrumbsRoot,
} from "./BrowserCrumbs.styled";

// TODO: merge with Breadcrumbs

const Crumb = ({ children }: { children: React.ReactNode }) => (
  <h5
    className={cx(CS.textUppercase, CS.textMedium)}
    style={{ fontWeight: 900 }}
  >
    {children}
  </h5>
);

type BrowserCrumbsType = {
  crumbs: {
    title: string | React.ReactNode;
    to?: string;
  }[];
};

export const BrowserCrumbs = ({ crumbs }: BrowserCrumbsType) => (
  <BrowserCrumbsRoot data-testid="browsercrumbs">
    {crumbs
      .filter((c) => c)
      .map((crumb, index, crumbs) => (
        <BrowserCrumbsItem key={index}>
          {crumb.to ? (
            <BrowserCrumbsLink to={crumb.to}>
              <Crumb>{crumb.title}</Crumb>
            </BrowserCrumbsLink>
          ) : (
            <Crumb>{crumb.title}</Crumb>
          )}
          {index < crumbs.length - 1 ? (
            <BrowserCrumbsIcon name="chevronright" />
          ) : null}
        </BrowserCrumbsItem>
      ))}
  </BrowserCrumbsRoot>
);
