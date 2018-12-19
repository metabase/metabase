import React from "react";

import cx from "classnames";

import Icon from "metabase/components/Icon";

const ColumnItem = ({ icon, children }) => (
  <div className="mx2 mb2 p1 px2 bg-light rounded h4 text-medium flex align-center">
    <Icon name={icon} className="mr1" />
    {children}
  </div>
);

export default ColumnItem;
