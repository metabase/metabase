import React from "react";
import PropTypes from "prop-types";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendCaptionIcon,
  LegendCaptionRoot,
  LegendCaptionTitle,
} from "./LegendCaption.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  onTitleSelect: PropTypes.func,
};

const LegendCaption = ({ className, title, description, onTitleSelect }) => {
  return (
    <LegendCaptionRoot className={className}>
      <LegendCaptionTitle onClick={onTitleSelect}>
        <Ellipsified>{title}</Ellipsified>
        {description && (
          <Tooltip tooltip={description} maxWidth="22em">
            <LegendCaptionIcon />
          </Tooltip>
        )}
      </LegendCaptionTitle>
    </LegendCaptionRoot>
  );
};

LegendCaption.propTypes = propTypes;

export default LegendCaption;
