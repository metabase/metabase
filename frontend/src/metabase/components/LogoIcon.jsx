import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

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
        <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="32px"
             viewBox="295.436 554.016 20 32" enableBackground="new 295.436 554.016 20 32">
          <g>
            <path fill="#FFFFFF" d="M315.031,560.393c-0.07-0.742-0.516-1.531-1.146-1.899l-7.143-4.188c-0.295-0.173-0.672-0.27-1.055-0.29
              h-0.308c-0.383,0.021-0.758,0.117-1.055,0.29l-7.222,4.188c-0.688,0.401-1.264,1.306-1.264,2.103v18.83
              c0,0.797,0.582,1.701,1.271,2.103l7.198,4.188c0.298,0.174,0.685,0.278,1.08,0.3h0.298c0.396-0.021,0.775-0.126,1.074-0.3
              l7.121-4.188c0.631-0.368,1.08-1.158,1.15-1.901V560.393L315.031,560.393z M297.432,561.166l5.918,3.425l1.679-0.923l-6.833-3.945
              l6.94-4.056c0.073-0.044,0.222-0.09,0.418-0.09s0.345,0.046,0.418,0.09l6.881,4.015l-15.421,8.915V561.166L297.432,561.166z
               M313.451,578.943l-6.012-3.445l-1.545,0.89l6.938,3.956l-6.863,4.012c-0.074,0.043-0.218,0.089-0.415,0.089
              s-0.346-0.046-0.42-0.089l-6.938-4.015l0.423-0.221l14.831-8.694v7.518H313.451z M313.451,568.602l-6.037-3.502l-1.542,0.888
              l6.991,4.026l-15.431,8.924v-7.431l5.892,3.41l1.672-0.925l-6.887-3.939l1.812-1.062l12.003-7.019l1.527-0.814V568.602
              L313.451,568.602z"/>
          </g>
        </svg>
    );
  }
}

export default function LogoIcon(props) {
  const [Component = DefaultLogoIcon] = PLUGIN_LOGO_ICON_COMPONENTS;
  return <Component {...props} />;
}
