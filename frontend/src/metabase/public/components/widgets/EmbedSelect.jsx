/* eslint-disable react/prop-types */
import React from "react";

import Icon from "metabase/components/Icon";

import cx from "classnames";

const EmbedSelect = ({ className, value, onChange, options }) => (
  <div className={cx(className, "flex")}>
    {options.map(option => (
      <div
        key={option.value}
        className={cx(
          "flex-full flex layout-centered mx1 p1 border-bottom border-medium",
          {
            "border-brand cursor-default": value === option.value,
            "border-dark-hover cursor-pointer": value !== option.value,
          },
        )}
        onClick={() => onChange(option.value)}
      >
        {option.icon && <Icon name={option.icon} className="mr1" />}
        {option.name}
      </div>
    ))}
    {/* hack because border-bottom doesn't add a border to the last element :-/ */}
    <div className="hide" />
  </div>
);

export default EmbedSelect;
