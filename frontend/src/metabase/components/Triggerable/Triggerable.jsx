/* eslint-disable react/prop-types */
import styled from "@emotion/styled";
import cx from "classnames";
import { createRef, cloneElement, Children, Component } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { isObscured } from "metabase/lib/dom";

const Trigger = styled.a``;

/**
 * higher order component that takes a component which takes props "isOpen" and optionally "onClose"
 * and returns a component that renders a <a> element "trigger", and tracks whether that component is open or not
 *
 * @deprecated HOCs are deprecated - use Modal + useState
 */
const Triggerable = ComposedComponent =>
  class extends Component {
    static displayName =
      "Triggerable[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    constructor(props, context) {
      super(props, context);

      this.state = {
        isOpen: props.isInitiallyOpen || false,
      };

      this._startCheckObscured = this._startCheckObscured.bind(this);
      this._stopCheckObscured = this._stopCheckObscured.bind(this);
      this.onClose = this.onClose.bind(this);
      this.trigger = createRef();
    }

    static defaultProps = {
      as: "a",
      closeOnObscuredTrigger: false,
    };

    open = () => {
      this.toggle(true);
    };

    close = () => {
      this.toggle(false);
    };

    toggle = (isOpen = !this.state.isOpen) => {
      this.setState({ isOpen });
    };

    onClose(e) {
      // don't close if clicked the actual trigger, it will toggle
      if (e && e.target && this.trigger.current.contains(e.target)) {
        return;
      }

      if (this.props.onClose) {
        this.props.onClose(e);
      }

      this.close();
    }

    target() {
      if (this.props.target) {
        return this.props.target();
      } else {
        return this.trigger.current;
      }
    }

    componentDidMount() {
      this.componentDidUpdate();
    }

    componentDidUpdate() {
      if (this.state.isOpen && this.props.closeOnObscuredTrigger) {
        this._startCheckObscured();
      } else {
        this._stopCheckObscured();
      }
    }

    componentWillUnmount() {
      this._stopCheckObscured();
    }

    _startCheckObscured() {
      if (this._offscreenTimer == null) {
        this._offscreenTimer = setInterval(() => {
          const trigger = this.trigger.current;
          if (isObscured(trigger)) {
            this.close();
          }
        }, 250);
      }
    }

    _stopCheckObscured() {
      if (this._offscreenTimer != null) {
        clearInterval(this._offscreenTimer);
        this._offscreenTimer = null;
      }
    }

    render() {
      const {
        as,
        triggerId,
        triggerClasses,
        triggerStyle,
        triggerClassesOpen,
        triggerClassesClose,
      } = this.props;

      const isOpen =
        this.props.isOpen != null ? this.props.isOpen : this.state.isOpen;

      let { triggerElement } = this.props;
      if (triggerElement && triggerElement.type === Tooltip) {
        // Disables tooltip when open:
        triggerElement = cloneElement(triggerElement, {
          isEnabled: triggerElement.props.isEnabled && !isOpen,
        });
      }

      let { children } = this.props;
      if (typeof children === "function" && isOpen) {
        // if children is a render prop, pass onClose to it
        children = children({ onClose: this.onClose });
      } else if (
        Children.count(children) === 1 &&
        Children.only(children).props.onClose === undefined &&
        typeof Children.only(children).type !== "string"
      ) {
        // if we have a single child which isn't an HTML element and doesn't have an onClose prop go ahead and inject it directly
        children = cloneElement(children, { onClose: this.onClose });
      }

      return (
        <>
          <Trigger
            as={as}
            id={triggerId}
            ref={this.trigger}
            onClick={event => {
              event.preventDefault();
              !this.props.disabled && this.toggle();
            }}
            className={cx(
              triggerClasses,
              isOpen && triggerClassesOpen,
              !isOpen && triggerClassesClose,
              CS.noDecoration,
              {
                [CS.cursorDefault]: this.props.disabled,
              },
            )}
            aria-disabled={this.props.disabled}
            style={triggerStyle}
          >
            {typeof triggerElement === "function"
              ? triggerElement({
                  isTriggeredComponentOpen: isOpen,
                  open: this.open,
                  close: this.close,
                })
              : triggerElement}
          </Trigger>
          {isOpen && (
            <ComposedComponent
              {...this.props}
              isOpen={isOpen}
              onClose={this.onClose}
              target={() => this.target()}
              sizeToFit
            >
              {children}
            </ComposedComponent>
          )}
        </>
      );
    }
  };

export default Object.assign(Triggerable, {
  Trigger,
});
