import styled from "@emotion/styled";
import cx from "classnames";
import React, {
  CSSProperties,
  Component,
  ComponentType,
  ElementType,
  ReactNode,
  SyntheticEvent,
  createRef,
} from "react";

import { isObscured } from "metabase/lib/dom";

import { Children } from "./Children";
import { TriggerElement } from "./TriggerElement";
import { RenderProp, RenderTriggerElement } from "./types";

const Trigger = styled.a``;

type TriggerableComponentProps<P extends Record<string, unknown>> = P & {
  isOpen: boolean;
  sizeToFit?: boolean;
  target?: () => EventTarget | null;
  onClose?: (event: SyntheticEvent) => void;
};

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

interface State {
  isOpen: boolean;
}

// higher order component that takes a component which takes props "isOpen" and optionally "onClose"
// and returns a component that renders a <a> element "trigger", and tracks whether that component is open or not
const _Triggerable = <P extends Record<string, unknown>>(
  ComposedComponent: ComponentType<TriggerableComponentProps<P>>,
) => {
  type TriggerableComposedComponentProps = Props &
    Omit<TriggerableComponentProps<P>, "isOpen" | "target" | "onClose">;

  const name = ComposedComponent.displayName || ComposedComponent.name;

  return class TriggerableComposedComponent extends Component<
    TriggerableComposedComponentProps,
    State
  > {
    static defaultProps = {
      as: "a",
      closeOnObscuredTrigger: false,
    };

    static displayName = `Triggerable[${name}]`;

    public trigger = createRef<HTMLAnchorElement>();

    private _offscreenTimer: number | null = null;

    constructor(props: TriggerableComposedComponentProps) {
      super(props);

      this.state = {
        isOpen: Boolean(this.props.isInitiallyOpen || false),
      };
    }

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
        children,
        triggerId,
        triggerClasses,
        triggerElement,
        triggerStyle,
        triggerClassesOpen,
        triggerClassesClose,
      } = this.props;
      const isOpen =
        this.props.isOpen != null ? this.props.isOpen : this.state.isOpen;

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
            <TriggerElement
              isOpen={isOpen}
              triggerElement={triggerElement}
              onClose={this.close}
              onOpen={this.open}
            />
          </Trigger>

          <ComposedComponent
            {...(this.props as P)}
            isOpen={isOpen}
            onClose={this.onClose}
            target={() => this.target()}
            sizeToFit
          >
            <Children isOpen={isOpen} onClose={this.onClose}>
              {children}
            </Children>
          </ComposedComponent>
        </>
      );
    }
  };
};

export const Triggerable = Object.assign(_Triggerable, {
  Trigger,
});
