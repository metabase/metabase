import React from "react";
import PropTypes from "prop-types";
import pure from "recompose/pure";
import { t } from "c-3po";
import S from "./FieldToGroupBy.css";
import Q from "metabase/components/QueryButton.css";

import Icon from "metabase/components/Icon.jsx";

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
        <span className="ml1 text-brand">{field.display_name}</span>
      </span>
      <Icon
        className={iconClass}
        size={20}
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
