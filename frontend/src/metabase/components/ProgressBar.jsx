/* @flow */
import React, { Component } from "react";
import styled from "styled-components";

import { color } from "metabase/lib/colors";

type Props = {
  percentage: number,
  animated: boolean,
  color: string,
  height: number,
};

const ProgressWrapper = styled.div`
  position: relative;
  border: 1px solid ${props => props.color};
  height: 10px;
  borderradius: 99px;
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
      borderBottomLeftRadius: 0;
      width: ${props => props.width}%;
      ":before": {
        display: ${props => (props.animated ? "block" : "none")};
        position: absolute,
        content: "";
        left: 0;
        width: ${props => props.width / 4}%;
        height: 100%;
        background-color: ${color("bg-black")};
        animation: ${props =>
          props.animated ? "progress-bar 1.5s linear infinite" : "none"};
      },
`;

export default class ProgressBar extends Component {
  props: Props;

  static defaultProps = {
    animated: false,
    color: color("brand"),
    height: 10,
  };

  render() {
    const { percentage, animated, color } = this.props;

    const width = percentage * 100;

    return (
      <ProgressWrapper color={color}>
        <Progress width={width} animated={animated} />
      </ProgressWrapper>
    );
  }
}
