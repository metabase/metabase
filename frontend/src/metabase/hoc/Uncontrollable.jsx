import React from "react";
import PropTypes from "prop-types";

import { getDisplayName } from "./utils";

// wraps a component that takes `value` and `onChange` and allows it to be "uncontrolled"
// i.e. https://reactjs.org/docs/uncontrolled-components.html

const Uncontrollable = () => WrappedComponent =>
  class extends React.Component {
    static displayName = `Uncontrollable(${getDisplayName(WrappedComponent)})`;

    constructor(props) {
      super(props);
      this.state = {
        value: props.defaultValue,
      };
    }

    static propTypes = {
      ...WrappedComponent.propTypes,
      // controlled
      value: PropTypes.any,
      onChange: PropTypes.func,
      // uncontrolled
      defaultValue: PropTypes.any,
    };

    handleChange = e => {
      this.setState({ value: e.target.value });
    };
    render() {
      if (this.props.value !== undefined) {
        // controlled
        return <WrappedComponent {...this.props} />;
      } else {
        // uncontrolled
        return (
          <WrappedComponent
            {...this.props}
            value={this.state.value}
            onChange={this.handleChange}
          />
        );
      }
    }
  };

export default Uncontrollable;
