/* @flow */
import React from "react";
import cx from "classnames";
import pure from "recompose/pure";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

type Attributes = {
  title: string,
  description?: string,
  className?: string,
};
const TitleAndDescription = ({ title, description, className }: Attributes) => (
  <div className={cx("flex align-center", className)}>
    <h2 className="h2 mr1 text-wrap">{title}</h2>
    {description && (
      <Tooltip tooltip={description} maxWidth={"22em"}>
        <Icon name="info" className="mx1" />
      </Tooltip>
    )}
  </div>
);

export default pure(TitleAndDescription);
