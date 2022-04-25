/* eslint-disable react/prop-types */
import React, { Component } from "react";

export const withBackground = className => ComposedComponent => {
  return class extends Component {
    static displayName = "BackgroundApplicator";

    UNSAFE_componentWillMount() {
      document.body.classList.add(className);
    }

    componentWillUnmount() {
      document.body.classList.remove(className);
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  };
};
