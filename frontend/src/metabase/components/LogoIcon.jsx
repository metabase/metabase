import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

export default class LogoIcon extends Component {
  static defaultProps = {
    size: 32,
  };

  static propTypes = {
    size: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
    dark: PropTypes.bool,
  };

  render() {
    let { dark, height, width, size } = this.props;
    return (

<svg className={cx({"text-brand": !dark }, { "text-white": dark })} fill="currentcolor" width={width || size} height={height || size} viewBox="0 0 200.86 200.86">
<g transform="translate(0.000000,200.000000) scale(0.100000,-0.100000)"  stroke="none">



<path d="M340 1480 c-66 -22 -120 -78 -145 -148 -9 -26 -19 -89 -22 -139 l-6
-93 -68 0 -69 0 0 -55 0 -55 70 0 70 0 0 -255 0 -255 75 0 75 0 0 255 0 255
85 0 85 0 0 55 0 55 -86 0 -87 0 5 83 c9 138 45 183 153 194 l55 6 0 58 0 59
-67 0 c-40 -1 -91 -9 -123 -20z"></path>
<path d="M670 990 l0 -510 75 0 75 0 0 510 0 510 -75 0 -75 0 0 -510z"></path>
<path d="M1660 990 l0 -510 75 0 75 0 0 255 0 255 75 0 75 0 0 55 0 55 -75 0
-75 0 0 200 0 200 -75 0 -75 0 0 -510z"></path>
<path d="M1000 1250 l0 -80 75 0 75 0 0 80 0 80 -75 0 -75 0 0 -80z"></path>
<path d="M1337 1323 c-4 -3 -7 -39 -7 -80 l0 -73 75 0 75 0 0 80 0 80 -68 0
c-38 0 -72 -3 -75 -7z"></path>
<path d="M1000 790 l0 -310 75 0 75 0 0 310 0 310 -75 0 -75 0 0 -310z"></path>
<path d="M1330 790 l0 -310 75 0 75 0 0 310 0 310 -75 0 -75 0 0 -310z"></path>
</g>
</svg>
  );
  }
}
