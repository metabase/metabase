import cx from "classnames";
import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router";

import { Ellipsified, Icon } from "metabase/ui";

import S from "./Breadcrumbs.module.css";

// A crumb can be:
// - [title] - just a string title (current page)
// - [title, url] - title with a URL link
// - [title, onClick] - title with an onClick handler
// - Or just a string `title` which gets normalized to [title]
type CrumbTuple =
  | [title: ReactNode]
  | [
      title: ReactNode,
      urlOrAction: string | MouseEventHandler<HTMLSpanElement>,
    ];

export type Crumb = ReactNode | CrumbTuple;

type BreadcrumbsProps = {
  className?: string;
  crumbs?: Crumb[];
  inSidebar?: boolean;
  placeholder?: string;
  size?: "medium" | "large";
};

export function Breadcrumbs({
  className,
  crumbs = [],
  inSidebar = false,
  placeholder,
  size = "medium",
}: BreadcrumbsProps) {
  const breadcrumbClass = inSidebar ? S.sidebarBreadcrumb : S.breadcrumb;
  const breadcrumbsClass = inSidebar ? S.sidebarBreadcrumbs : S.breadcrumbs;

  return (
    <section
      data-testid="breadcrumbs"
      className={cx(className, breadcrumbsClass)}
    >
      {crumbs.length <= 1 && placeholder ? (
        <span className={cx(breadcrumbClass, S.breadcrumbPage)}>
          {placeholder}
        </span>
      ) : (
        crumbs
          .map(
            (breadcrumb): CrumbTuple =>
              isCrumbTuple(breadcrumb) ? breadcrumb : [breadcrumb],
          )
          .map((breadcrumb, index) => {
            const linkTarget = isLinkCrumb(breadcrumb)
              ? breadcrumb[1]
              : undefined;
            const onClick = isActionCrumb(breadcrumb)
              ? breadcrumb[1]
              : undefined;

            return (
              <Ellipsified
                key={index}
                tooltip={breadcrumb[0]}
                tooltipProps={{ w: "auto" }}
                className={cx(
                  breadcrumbClass,
                  breadcrumb.length > 1 ? S.breadcrumbPath : S.breadcrumbPage,
                  { [S.fontLarge]: size === "large" },
                )}
              >
                {linkTarget ? (
                  <Link to={linkTarget}>{breadcrumb[0]}</Link>
                ) : (
                  <span onClick={onClick}>{breadcrumb[0]}</span>
                )}
              </Ellipsified>
            );
          })
          .map((breadcrumb, index, breadcrumbs) =>
            index < breadcrumbs.length - 1
              ? [
                  breadcrumb,
                  <Icon
                    key={`${index}-separator`}
                    name="chevronright"
                    className={S.breadcrumbDivider}
                    width={12}
                    height={12}
                  />,
                ]
              : breadcrumb,
          )
      )}
    </section>
  );
}

function isCrumbTuple(crumb: Crumb): crumb is CrumbTuple {
  return Array.isArray(crumb);
}

function isLinkCrumb(crumb: CrumbTuple): crumb is [ReactNode, string] {
  return crumb.length > 1 && typeof crumb[1] === "string";
}

function isActionCrumb(
  crumb: CrumbTuple,
): crumb is [ReactNode, MouseEventHandler<HTMLSpanElement>] {
  return crumb.length > 1 && typeof crumb[1] === "function";
}
