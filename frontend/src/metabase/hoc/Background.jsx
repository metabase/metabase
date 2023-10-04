import { Component } from "react";

/**
 * @deprecated HOCs are deprecated
 */
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
