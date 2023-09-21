import { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

import cx from "classnames";
import { Icon } from "metabase/core/components/Icon";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import S from "./Breadcrumbs.css";

// TODO: merge with BrowserCrumbs

export default class Breadcrumbs extends Component {
  static propTypes = {
    className: PropTypes.string,
    // each "crumb" is an array, the first index being the string title, the
    // second index being a string URL or action function
    crumbs: PropTypes.array,
    inSidebar: PropTypes.bool,
    placeholder: PropTypes.string,
    size: PropTypes.oneOf(["medium", "large"]),
  };
  static defaultProps = {
    crumbs: [],
    inSidebar: false,
    placeholder: null,
    size: "medium",
  };

  render() {
    const { className, crumbs, inSidebar, placeholder, size } = this.props;

    const breadcrumbClass = inSidebar ? S.sidebarBreadcrumb : S.breadcrumb;
    const breadcrumbsClass = inSidebar ? S.sidebarBreadcrumbs : S.breadcrumbs;

    return (
      <section className={cx(className, breadcrumbsClass)}>
        {crumbs.length <= 1 && placeholder ? (
          <span className={cx(breadcrumbClass, S.breadcrumbPage)}>
            {placeholder}
          </span>
        ) : (
          crumbs
            .map(breadcrumb =>
              Array.isArray(breadcrumb) ? breadcrumb : [breadcrumb],
            )
            .map((breadcrumb, index) => (
              <Ellipsified
                key={index}
                tooltip={breadcrumb[0]}
                tooltipMaxWidth="100%"
                className={cx(
                  breadcrumbClass,
                  breadcrumb.length > 1 ? S.breadcrumbPath : S.breadcrumbPage,
                  { [S.fontLarge]: size === "large" },
                )}
              >
                {breadcrumb.length > 1 && typeof breadcrumb[1] === "string" ? (
                  <Link to={breadcrumb[1]}>{breadcrumb[0]}</Link>
                ) : (
                  <span onClick={breadcrumb[1]}>{breadcrumb[0]}</span>
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
}
