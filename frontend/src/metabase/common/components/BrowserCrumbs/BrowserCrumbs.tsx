import cx from "classnames";
import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import S from "./BrowserCrumbs.module.css";

// TODO: merge with Breadcrumbs

const Crumb = ({ children }: { children: ReactNode }) => (
  <h5
    className={cx(CS.textUppercase, CS.textMedium)}
    style={{ fontWeight: 900 }}
  >
    {children}
  </h5>
);

type BrowserCrumbsType = {
  crumbs: {
    title: string | ReactNode;
    to?: string;
  }[];
};

export const BrowserCrumbs = ({ crumbs }: BrowserCrumbsType) => (
  <div className={S.root} data-testid="browsercrumbs">
    {crumbs
      .filter((c) => c)
      .map((crumb, index, crumbs) => (
        <div key={index} className={S.item}>
          {crumb.to ? (
            <Link className={S.link} to={crumb.to}>
              <Crumb>{crumb.title}</Crumb>
            </Link>
          ) : (
            <Crumb>{crumb.title}</Crumb>
          )}
          {index < crumbs.length - 1 ? (
            <Icon className={S.icon} name="chevronright" />
          ) : null}
        </div>
      ))}
  </div>
);
