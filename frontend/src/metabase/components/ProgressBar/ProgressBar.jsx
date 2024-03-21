import styled from "@emotion/styled";
import PropTypes from "prop-types";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { color as c } from "metabase/lib/colors";

const propTypes = {
  percentage: PropTypes.number.isRequired,
  animated: PropTypes.bool,
  color: PropTypes.string,
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
};

const ProgressWrapper = styled.div`
  position: relative;
  border: 1px solid ${props => props.color};
  height: ${props => props.height};
  border-radius: 99px;
  transition: border-color 0.3s;
`;

const Progress = styled.div`
  overflow: hidden;
  background-color: ${props => props.color};
  position: relative;
  height: 100%;
  top: 0;
  left: 0;
  border-radius: inherit;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  width: ${props => props.width}%;
  transition: background-color 0.3s;

  "&::before": {
    display: ${props => (props.animated ? "block" : "none")};
    position: absolute;
    content: "";
    left: 0;
    width: ${props => props.width / 4}%;
    height: 100%;
    background-color: ${c("bg-black")};
  },
`;

// @Question - why is this separate from our progress Viz type?
export default class ProgressBar extends Component {
  static defaultProps = {
    animated: false,
    height: 10,
  };

  render() {
    const {
      percentage,
      height,
      animated,
      color = c("brand"),
      className,
    } = this.props;

    const width = percentage * 100;

    return (
      <ProgressWrapper color={color} height={height} className={className}>
        <Progress
          width={width}
          animated={animated}
          color={color}
          className={
            animated ? CS.ProgressBarAnimation : CS.ProgressBarNoAnimation
          }
        />
      </ProgressWrapper>
    );
  }
}

ProgressBar.propTypes = propTypes;
