/* eslint "react/prop-types": 2 */

import React, { useState } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Icon from "metabase/components/Icon";

function CollapseSection({
  children,
  header,
  headerClass,
  bodyClass,
  initialState = "closed",
}) {
  const [isOpen, setIsOpen] = useState(initialState === "open");

  return (
    <div
      className={cx("collapse-section", isOpen && "collapse-section--open")}
      role="tab"
      aria-expanded={isOpen}
    >
      <div
        role="button"
        tabIndex="0"
        className={cx(
          "collapse-section__header cursor-pointer flex align-center",
          headerClass,
        )}
        onClick={() => setIsOpen(isOpen => !isOpen)}
        onKeyDown={e => e.key === "Enter" && setIsOpen(isOpen => !isOpen)}
      >
        <Icon
          className="mr1"
          name={isOpen ? "chevrondown" : "chevronright"}
          size={12}
        />
        <span className="collapse-section__header-text flex align-center">
          {header}
        </span>
      </div>
      <div role="tabpanel" className="collapse-section__body-container">
        {isOpen && (
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
  header: PropTypes.node,
  headerClass: PropTypes.string,
  bodyClass: PropTypes.string,
  initialState: PropTypes.oneOf(["open", "closed"]),
};

export default CollapseSection;
