/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import Q from "metabase/components/QueryButton/QueryButton.module.css";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import S from "./FieldToGroupBy.module.css";

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
      <div className={S.fieldToGroupByText}>
        <div className={cx(CS.textBrand, CS.textBold)}>
          {field.display_name}
        </div>
      </div>
      <Icon
        className={cx(iconClass, CS.pr1)}
        tooltip={field.description ? field.description : t`Look up this field`}
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

export default memo(FieldToGroupBy);
