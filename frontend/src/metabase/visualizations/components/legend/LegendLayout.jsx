import React from "react";
import {
  CaptionContainer,
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
} from "./LegendLayout.styled";
import Legend from "./Legend";
import LegendCaption from "./LegendCaption";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  children: PropTypes.node,
  onSelectTitle: PropTypes.func,
};

const LegendLayout = ({
  className,
  title,
  description,
  icon,
  actionButtons,
  children,
  onSelectTitle,
}) => {
  return (
    <LegendLayoutRoot className={className}>
      <CaptionContainer>
        <LegendCaption
          title={title}
          description={description}
          icon={icon}
          actionButtons={actionButtons}
          onSelectTitle={onSelectTitle}
        />
      </CaptionContainer>
      <LegendContainer>
        <Legend />
      </LegendContainer>
      <ChartContainer>{children}</ChartContainer>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default LegendLayout;
