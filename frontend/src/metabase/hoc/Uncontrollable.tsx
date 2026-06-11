import PropTypes from "prop-types";
import { Component, type ComponentType } from "react";

import { getDisplayName } from "./utils";

// wraps a component that takes `value` and `onChange` and allows it to be "uncontrolled"
// i.e. https://reactjs.org/docs/uncontrolled-components.html

type UncontrollableChangeEvent = { target: { value: unknown } };

interface UncontrollableProps {
  value?: unknown;
  defaultValue?: unknown;
  onChange?: (event: UncontrollableChangeEvent) => void;
}

/**
 * @deprecated HOCs are deprecated
 *
 * Returns a transparently-typed component so wrapping doesn't tighten (or break)
 * the wide-open prop types the many existing consumers rely on.
 */
const Uncontrollable =
  () =>
  (WrappedComponent: ComponentType<any>): ComponentType<any> => {
    class UncontrollableComponent extends Component<
      UncontrollableProps,
      { value: unknown }
    > {
      static displayName = `Uncontrollable(${getDisplayName(
        WrappedComponent,
      )})`;

      static propTypes = {
        ...WrappedComponent.propTypes,
        // controlled
        value: PropTypes.any,
        onChange: PropTypes.func,
        // uncontrolled
        defaultValue: PropTypes.any,
      };

      state = {
        value: this.props.defaultValue,
      };

      handleChange = (e: UncontrollableChangeEvent) => {
        this.setState({ value: e.target.value });
        this.props.onChange?.(e);
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
    }

    return UncontrollableComponent;
  };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Uncontrollable;
