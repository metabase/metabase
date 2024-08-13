import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { PLUGIN_LOGO_ICON_COMPONENTS } from "metabase/plugins";

class DefaultLogoIcon extends Component {
  static defaultProps = {
    height: 32,
  };
  static propTypes = {
    width: PropTypes.number,
    height: PropTypes.number,
    dark: PropTypes.bool,
  };

  render() {
    const { dark, height, width } = this.props;
    return (
      <svg
        className={cx(
          "Icon",
          { [CS.textBrand]: !dark },
          { [CS.textWhite]: dark },
        )}
        viewBox="0 0 200 200"
        width={width}
        height={height}
        fill="currentcolor"
        data-testid="main-logo"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M78.4129 41.3872C80.2391 35.3132 75.095 28.9722 69.3111 31.5747C67.0101 32.6101 64.7394 33.7709 62.5074 35.0595C26.6403 55.7668 14.3514 101.629 35.0593 137.495C55.7671 173.361 101.63 185.649 137.497 164.942C141.569 162.591 145.337 159.916 148.787 156.969C153.219 153.182 150.057 146.373 144.294 145.496V145.496C142.169 145.173 140.017 145.776 138.335 147.114C136.024 148.952 133.549 150.643 130.915 152.164C102.21 168.736 65.5057 158.901 48.933 130.197C32.3604 101.493 42.1953 64.7899 70.9 48.2177C71.9447 47.6146 73.0001 47.0464 74.0646 46.5128C76.1527 45.4663 77.7404 43.6239 78.4129 41.3872V41.3872Z"
          fill="#011F4E"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M159.656 136.956C162.866 137.408 166.002 135.757 167.419 132.843C177.936 111.206 177.875 84.9043 164.941 62.502C151.203 38.7075 126.393 25.2902 100.775 25.0005C97.6035 24.9646 94.785 26.9785 93.7659 29.9825C91.939 35.3683 96.743 40.3551 102.424 40.6117C102.602 40.6197 102.78 40.6286 102.958 40.6382C106.87 40.8501 107.545 46.344 104.517 48.8289V48.8289C87.9708 62.4077 85.5728 86.8326 99.161 103.384C112.749 119.934 137.178 122.344 153.724 108.765V108.765C155.556 107.262 158.554 108.595 158.112 110.924C157.249 115.479 155.856 119.927 153.96 124.168C151.59 129.469 153.907 136.146 159.656 136.956ZM144.977 98.1144C134.31 106.868 118.562 105.315 109.802 94.6452C101.042 83.9754 102.588 68.2296 113.255 59.4759C123.921 50.7221 139.67 52.2753 148.429 62.9451C157.189 73.6148 155.643 89.3606 144.977 98.1144Z"
          fill="#0458DD"
        />
      </svg>
    );
  }
}

export default function LogoIcon(props) {
  const [Component = DefaultLogoIcon] = PLUGIN_LOGO_ICON_COMPONENTS;
  return <Component {...props} />;
}
