import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { PLUGIN_LOGO_ICON_COMPONENTS } from "metabase/plugins";

export class DefaultLogoIcon extends Component {
  static defaultProps = {
    height: 32,
  };
  static propTypes = {
    width: PropTypes.number,
    height: PropTypes.number,
    dark: PropTypes.bool,
    fill: PropTypes.string,
  };

  render() {
    const { dark, height, width, fill = "currentcolor" } = this.props;
    return (
      <svg
        className={cx(
          "Icon",
          { [CS.textBrand]: !dark },
          { [CS.textWhite]: dark },
        )}
        viewBox="0 0 212 256"
        width={width}
        height={height}
        fill={fill}
        data-testid="main-logo"
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M15.5514 76.0822C24.1402 76.0822 31.1028 69.1196 31.1028 60.5308C31.1028 51.942 24.1402 44.9794 15.5514 44.9794C6.9626 44.9794 0 51.942 0 60.5308C0 69.1196 6.9626 76.0822 15.5514 76.0822Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M15.5514 121.062C24.1402 121.062 31.1028 114.099 31.1028 105.51C31.1028 96.9215 24.1402 89.9589 15.5514 89.9589C6.9626 89.9589 0 96.9215 0 105.51C0 114.099 6.9626 121.062 15.5514 121.062Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M60.5309 121.062C69.1197 121.062 76.0823 114.099 76.0823 105.51C76.0823 96.9215 69.1197 89.9589 60.5309 89.9589C51.9421 89.9589 44.9795 96.9215 44.9795 105.51C44.9795 114.099 51.9421 121.062 60.5309 121.062Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M195.469 76.0822C204.058 76.0822 211.021 69.1196 211.021 60.5308C211.021 51.942 204.058 44.9794 195.469 44.9794C186.88 44.9794 179.918 51.942 179.918 60.5308C179.918 69.1196 186.88 76.0822 195.469 76.0822Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M150.49 121.062C159.079 121.062 166.041 114.099 166.041 105.51C166.041 96.9215 159.079 89.9589 150.49 89.9589C141.901 89.9589 134.938 96.9215 134.938 105.51C134.938 114.099 141.901 121.062 150.49 121.062Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M105.51 166.041C114.099 166.041 121.062 159.079 121.062 150.49C121.062 141.901 114.099 134.938 105.51 134.938C96.9215 134.938 89.9589 141.901 89.9589 150.49C89.9589 159.079 96.9215 166.041 105.51 166.041Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M195.469 121.062C204.058 121.062 211.021 114.099 211.021 105.51C211.021 96.9215 204.058 89.9589 195.469 89.9589C186.88 89.9589 179.918 96.9215 179.918 105.51C179.918 114.099 186.88 121.062 195.469 121.062Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M15.5514 166.041C24.1402 166.041 31.1028 159.079 31.1028 150.49C31.1028 141.901 24.1402 134.938 15.5514 134.938C6.9626 134.938 0 141.901 0 150.49C0 159.079 6.9626 166.041 15.5514 166.041Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M195.469 166.041C204.058 166.041 211.021 159.079 211.021 150.49C211.021 141.901 204.058 134.938 195.469 134.938C186.88 134.938 179.918 141.901 179.918 150.49C179.918 159.079 186.88 166.041 195.469 166.041Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M15.5514 211.021C24.1402 211.021 31.1028 204.058 31.1028 195.469C31.1028 186.88 24.1402 179.918 15.5514 179.918C6.9626 179.918 0 186.88 0 195.469C0 204.058 6.9626 211.021 15.5514 211.021Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M195.469 211.021C204.058 211.021 211.021 204.058 211.021 195.469C211.021 186.88 204.058 179.918 195.469 179.918C186.88 179.918 179.918 186.88 179.918 195.469C179.918 204.058 186.88 211.021 195.469 211.021Z"
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M60.5309 76.0822C69.1197 76.0822 76.0823 69.1196 76.0823 60.5308C76.0823 51.942 69.1197 44.9794 60.5309 44.9794C51.9421 44.9794 44.9795 51.942 44.9795 60.5308C44.9795 69.1196 51.9421 76.0822 60.5309 76.0822Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M105.51 76.0822C114.099 76.0822 121.062 69.1196 121.062 60.5308C121.062 51.942 114.099 44.9794 105.51 44.9794C96.9215 44.9794 89.9589 51.942 89.9589 60.5308C89.9589 69.1196 96.9215 76.0822 105.51 76.0822Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M105.51 31.1028C114.099 31.1028 121.062 24.1402 121.062 15.5514C121.062 6.9626 114.099 0 105.51 0C96.9215 0 89.9589 6.9626 89.9589 15.5514C89.9589 24.1402 96.9215 31.1028 105.51 31.1028Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M105.51 121.062C114.099 121.062 121.062 114.099 121.062 105.51C121.062 96.9215 114.099 89.9589 105.51 89.9589C96.9215 89.9589 89.9589 96.9215 89.9589 105.51C89.9589 114.099 96.9215 121.062 105.51 121.062Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M150.49 76.0822C159.079 76.0822 166.041 69.1196 166.041 60.5308C166.041 51.942 159.079 44.9794 150.49 44.9794C141.901 44.9794 134.938 51.942 134.938 60.5308C134.938 69.1196 141.901 76.0822 150.49 76.0822Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M60.5309 166.041C69.1197 166.041 76.0823 159.079 76.0823 150.49C76.0823 141.901 69.1197 134.938 60.5309 134.938C51.9421 134.938 44.9795 141.901 44.9795 150.49C44.9795 159.079 51.9421 166.041 60.5309 166.041Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M150.49 166.041C159.079 166.041 166.041 159.079 166.041 150.49C166.041 141.901 159.079 134.938 150.49 134.938C141.901 134.938 134.938 141.901 134.938 150.49C134.938 159.079 141.901 166.041 150.49 166.041Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M60.5309 211.021C69.1197 211.021 76.0823 204.058 76.0823 195.469C76.0823 186.88 69.1197 179.918 60.5309 179.918C51.9421 179.918 44.9795 186.88 44.9795 195.469C44.9795 204.058 51.9421 211.021 60.5309 211.021Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M105.51 211.021C114.099 211.021 121.062 204.058 121.062 195.469C121.062 186.88 114.099 179.918 105.51 179.918C96.9215 179.918 89.9589 186.88 89.9589 195.469C89.9589 204.058 96.9215 211.021 105.51 211.021Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M105.51 256C114.099 256 121.062 249.037 121.062 240.449C121.062 231.86 114.099 224.897 105.51 224.897C96.9215 224.897 89.9589 231.86 89.9589 240.449C89.9589 249.037 96.9215 256 105.51 256Z"
          opacity={0.2}
        />
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M150.49 211.021C159.079 211.021 166.041 204.058 166.041 195.469C166.041 186.88 159.079 179.918 150.49 179.918C141.901 179.918 134.938 186.88 134.938 195.469C134.938 204.058 141.901 211.021 150.49 211.021Z"
          opacity={0.2}
        />
      </svg>
    );
  }
}

export default function LogoIcon(props) {
  const [Component = DefaultLogoIcon] = PLUGIN_LOGO_ICON_COMPONENTS;
  return <Component {...props} />;
}
