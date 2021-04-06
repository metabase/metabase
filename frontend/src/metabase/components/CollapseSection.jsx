/* eslint "react/prop-types": 2 */

import React, { useState } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Icon from "metabase/components/Icon";

function CollapseSection({
  children,
  className,
  header,
  headerClass,
  bodyClass,
  initialState = "collapsed",
}) {
  const [isExpanded, setIsExpanded] = useState(initialState === "expanded");

  return (
    <div
      className={cx(
        "collapse-section",
        isExpanded && "collapse-section--expanded",
        className,
      )}
      role="tab"
      aria-expanded={isExpanded}
    >
      <div
        role="button"
        tabIndex="0"
        className={cx(
          "collapse-section__header cursor-pointer flex align-center",
          headerClass,
        )}
        onClick={() => setIsExpanded(isExpanded => !isExpanded)}
        onKeyDown={e =>
          e.key === "Enter" && setIsExpanded(isExpanded => !isExpanded)
        }
      >
        <Icon
          className="mr1"
          name={isExpanded ? "chevrondown" : "chevronright"}
          size={12}
        />
        <span className="collapse-section__header-text flex align-center">
          {header}
        </span>
      </div>
      <div role="tabpanel" className="collapse-section__body-container">
        {isExpanded && (
          <div className={cx("collapse-section__body-container", bodyClass)}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

CollapseSection.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  header: PropTypes.node,
  headerClass: PropTypes.string,
  bodyClass: PropTypes.string,
  initialState: PropTypes.oneOf(["expanded", "collapsed"]),
};

export default CollapseSection;
