import cx from "classnames";
import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Icon } from "metabase/ui";

import S from "./Breadcrumbs.module.css";

// A crumb can be:
// - [title] - just a string title (current page)
// - [title, url] - title with a URL link
// - [title, onClick] - title with an onClick handler
// - Or just a string `title` which gets normalized to [title]
type CrumbTuple =
  | [title: ReactNode]
  | [title: ReactNode, urlOrAction: string | MouseEventHandler<HTMLSpanElement>];

type Crumb = ReactNode | CrumbTuple;

type BreadcrumbsProps = {
  className?: string;
  // each "crumb" is an array, the first index being the string title, the
  // second index being a string URL or action function
  crumbs?: Crumb[];
  inSidebar?: boolean;
  placeholder?: string;
  size?: "medium" | "large";
};

export function Breadcrumbs({
  className,
  crumbs = [],
  inSidebar = false,
  placeholder = undefined,
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
          .map((breadcrumb): CrumbTuple =>
            Array.isArray(breadcrumb) ? breadcrumb : [breadcrumb],
          )
          .map((breadcrumb, index) => (
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
              {breadcrumb.length > 1 && typeof breadcrumb[1] === "string" ? (
                <Link to={breadcrumb[1]}>{breadcrumb[0]}</Link>
              ) : (
                <span onClick={breadcrumb[1] as MouseEventHandler<HTMLSpanElement> | undefined}>
                  {breadcrumb[0]}
                </span>
              )}
            </Ellipsified>
          ))
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
