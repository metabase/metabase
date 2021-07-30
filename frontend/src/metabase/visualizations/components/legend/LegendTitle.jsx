import React from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendTitleIcon,
  LegendTitleInfo,
  LegendTitleLabel,
  LegendTitleRoot,
} from "./LegendTitle.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  onSelectTitle: PropTypes.func,
};

const LegendTitle = ({
  className,
  title,
  description,
  icon,
  onSelectTitle,
}) => {
  return (
    <LegendTitleRoot className={className}>
      {icon && <LegendTitleIcon {...icon} />}
      <LegendTitleLabel onClick={onSelectTitle}>
        <Ellipsified>{title}</Ellipsified>
      </LegendTitleLabel>
      {description && (
        <Tooltip tooltip={description} maxWidth="22em">
          <LegendTitleInfo />
        </Tooltip>
      )}
    </LegendTitleRoot>
  );
};

LegendTitle.propTypes = propTypes;

export default LegendTitle;
