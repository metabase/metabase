import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon.jsx";

const Clearable = ({ onClear, children, className }) => (
  <div className={cx("flex align-center", className)}>
    {children}
    {onClear && (
      <a
        className="text-grey-2 no-decoration pr1 flex align-center"
        onClick={onClear}
      >
        <Icon name="close" size={14} />
      </a>
    )}
  </div>
);

export default Clearable;
