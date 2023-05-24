import styled from "@emotion/styled";
import cx from "classnames";
import React, {
  CSSProperties,
  Children,
  Component,
  ComponentType,
  ElementType,
  ReactNode,
  SyntheticEvent,
  cloneElement,
  createRef,
} from "react";

import Tooltip from "metabase/core/components/Tooltip";
import { isObscured } from "metabase/lib/dom";

import { RenderProp } from "./types";
import { isRenderProp, isReactElement } from "./utils";

const Trigger = styled.a``;

type TriggerableComponent = ComponentType<{
  isOpen: boolean;
  onClose?: (event: SyntheticEvent) => void;
  sizeToFit?: boolean;
  target?: Props["target"];
}>;

interface Props {
  as?: ElementType | ComponentType;
  children:
    | ReactNode
    | RenderProp<{ onClose: (event: SyntheticEvent) => void }>;
  closeOnObscuredTrigger?: boolean;
  disabled?: boolean;
  isInitiallyOpen?: boolean;
  isOpen?: boolean;
  target?: () => EventTarget | null;
  triggerClasses?: string;
  triggerClassesClose?: string;
  triggerClassesOpen?: string;
  triggerElement?: ReactNode | RenderTriggerElement;
  triggerId?: string;
  triggerStyle?: CSSProperties;
  onClose?: (event: SyntheticEvent) => void;
}

type RenderTriggerElement = (props: {
  isTriggeredComponentOpen: boolean;
  open: () => void;
  close: () => void;
}) => ReactNode;

interface State {
  isOpen: boolean;
}

// higher order component that takes a component which takes props "isOpen" and optionally "onClose"
// and returns a component that renders a <a> element "trigger", and tracks whether that component is open or not
const _Triggerable = (ComposedComponent: TriggerableComponent) => {
  const name = ComposedComponent.displayName || ComposedComponent.name;

  return class extends Component<Props, State> {
    static defaultProps = {
      as: "a",
    };

    static displayName = `Triggerable[${name}]`;

    public trigger = createRef<HTMLAnchorElement>();

    private _offscreenTimer: number | null = null;

    state = {
      isOpen: this.props.isInitiallyOpen || false,
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

    onClose = (event: SyntheticEvent) => {
      // don't close if clicked the actual trigger, it will toggle
      if (
        event &&
        event.target instanceof Node &&
        this.trigger.current?.contains(event.target)
      ) {
        return;
      }

      if (this.props.onClose) {
        this.props.onClose(event);
      }

      this.close();
    };

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

    _startCheckObscured = () => {
      if (this._offscreenTimer == null) {
        this._offscreenTimer = window.setInterval(() => {
          const trigger = this.trigger.current;
          if (isObscured(trigger)) {
            this.close();
          }
        }, 250);
      }
    };
    _stopCheckObscured = () => {
      if (this._offscreenTimer != null) {
        window.clearInterval(this._offscreenTimer);
        this._offscreenTimer = null;
      }
    };

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
      if (isReactElement(triggerElement) && triggerElement.type === Tooltip) {
        // Disables tooltip when open:
        triggerElement = cloneElement(triggerElement, {
          isEnabled: triggerElement.props.isEnabled && !isOpen,
        });
      }

      let { children } = this.props;

      if (isRenderProp(children)) {
        children = children({ onClose: this.onClose });
      } else if (Children.count(children) === 1) {
        const child = Children.only(children);

        if (isReactElement(child)) {
          const isHtmlElement = child.type === "string";
          const hasOnCloseProp = typeof child.props.onClose !== "undefined";

          if (!isHtmlElement && !hasOnCloseProp) {
            children = cloneElement(child, { onClose: this.onClose });
          }
        }
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
              "no-decoration",
              {
                "cursor-default": this.props.disabled,
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

          <ComposedComponent
            {...this.props}
            isOpen={isOpen}
            onClose={this.onClose}
            target={() => this.target()}
            sizeToFit
          >
            {children}
          </ComposedComponent>
        </>
      );
    }
  };
};

export const Triggerable = Object.assign(_Triggerable, {
  Trigger,
});
