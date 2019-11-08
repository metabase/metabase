import React from "react";
import PropTypes from "prop-types";
import pure from "recompose/pure";
import { t } from "ttag";
import cx from "classnames";
import S from "./FieldToGroupBy.css";
import Q from "metabase/components/QueryButton.css";

import Icon from "metabase/components/Icon";

const FieldToGroupBy = ({
  className,
  metric,
  field,
  icon,
  iconClass,
  onClick,
  secondaryOnClick,
}) => (
  <div className={className}>
    <a className={Q.queryButton} onClick={onClick}>
      <span className={S.fieldToGroupByText}>
        <span>{`${metric.name} ` + t`by` + ` `}</span>
        <span className="text-brand">{field.display_name}</span>
      </span>
      <Icon
        className={cx(iconClass, "ml4 pl4")}
        tooltip={t`Look up this field`}
        size={16}
        name="reference"
        onClick={secondaryOnClick}
      />
    </a>
  </div>
);
FieldToGroupBy.propTypes = {
  className: PropTypes.string,
  metric: PropTypes.object.isRequired,
  field: PropTypes.object.isRequired,
  iconClass: PropTypes.string,
  onClick: PropTypes.func,
  secondaryOnClick: PropTypes.func,
};

export default pure(FieldToGroupBy);
