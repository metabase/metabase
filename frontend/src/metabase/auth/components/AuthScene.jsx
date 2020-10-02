/* eslint-disable no-color-literals */

import React, { Component } from "react";

import { connect } from "react-redux";
import { PLUGIN_SELECTORS } from "metabase/plugins";

const mapStateToProps = (state, props) => ({
  showAuthScene: PLUGIN_SELECTORS.getShowAuthScene(state, props),
});

class AuthScene extends Component {
  render() {
    if (!this.props.showAuthScene) {
      return null;
    }

    return (
      <section className="z1 absolute bottom left right">
        <img
          id="BridgeImg"
          src="/app/img/bridge.png"
          srcSet="/app/img/bridge.png 1x, /app/img/bridge@2x.png 2x, /app/img/bridge@3x.png 3x"
        />
      </section>
    );
  }
}

export default connect(mapStateToProps)(AuthScene);
