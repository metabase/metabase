import React from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendCaptionIcon,
  LegendCaptionInfoIcon,
  LegendCaptionRoot,
  LegendCaptionTitle,
} from "./LegendCaption.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  onSelectTitle: PropTypes.func,
};

const LegendCaption = ({
  className,
  title,
  description,
  icon,
  onSelectTitle,
}) => {
  return (
    <LegendCaptionRoot className={className}>
      {icon && <LegendCaptionIcon {...icon} />}
      <LegendCaptionTitle onClick={onSelectTitle}>
        <Ellipsified>{title}</Ellipsified>
        {description && (
          <Tooltip tooltip={description} maxWidth="22em">
            <LegendCaptionInfoIcon />
          </Tooltip>
        )}
      </LegendCaptionTitle>
    </LegendCaptionRoot>
  );
};

LegendCaption.propTypes = propTypes;

export default LegendCaption;
