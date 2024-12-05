import cx from "classnames";
import debounce from "lodash.debounce";
import type {
  CSSProperties,
  ComponentType,
  ForwardedRef,
  PropsWithoutRef,
} from "react";
import React, { Component } from "react";
import ReactDOM from "react-dom";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { isCypressActive } from "metabase/env";
import { delay } from "metabase/lib/delay";
import resizeObserver from "metabase/lib/resize-observer";

const WAIT_TIME = delay(300);

const REFRESH_MODE = {
  throttle: (fn: () => void) => _.throttle(fn, WAIT_TIME),
  debounce: (fn: () => void) => debounce(fn, WAIT_TIME),
  debounceLeading: (fn: () => void) =>
    debounce(fn, WAIT_TIME, { leading: true }),
  none: (fn: () => void) => fn,
};

export type RefreshMode = keyof typeof REFRESH_MODE;

interface ExplicitSizeProps<T> {
  selector?: string;
  wrapped?: boolean;
  refreshMode?: RefreshMode | ((props: T) => RefreshMode);
}

type SizeState = {
  width: number | null;
  height: number | null;
};

type InnerProps = {
  forwardedRef: ForwardedRef<unknown>;
  className?: string;
  style?: CSSProperties;
  onUpdateSize?: () => void;
};

type ExplicitSizeOuterProps<T> = Omit<T, "width" | "height">;

/**
 * @deprecated HOCs are deprecated
 */
function ExplicitSize<T>({
  selector,
  wrapped = false,
  refreshMode = "throttle",
}: ExplicitSizeProps<T> = {}) {
  return (ComposedComponent: ComponentType<T & SizeState>) => {
    const displayName = ComposedComponent.displayName || ComposedComponent.name;

    class WrappedComponent extends Component<T & InnerProps> {
      static displayName = `ExplicitSize[${displayName}]`;

      state: SizeState = {
        width: null,
        height: null,
      };

      timeoutId: ReturnType<typeof setTimeout> | null = null;

      _currentElement: Element | null = null;

      _printMediaQuery = window.matchMedia && window.matchMedia("print");

      _refreshMode: RefreshMode;

      _updateSize: () => void;

      constructor(props: T & InnerProps) {
        super(props);

        this._printMediaQuery = window.matchMedia && window.matchMedia("print");
        if (WAIT_TIME === 0) {
          this._refreshMode = "none";
        } else {
          this._refreshMode =
            typeof refreshMode === "string" ? refreshMode : "throttle";
        }
        const refreshFn = REFRESH_MODE[this._getRefreshMode()];
        this._updateSize = refreshFn(this.__updateSize);
      }

      _getElement() {
        try {
          let element = ReactDOM.findDOMNode(this);
          if (selector && element instanceof Element) {
            element = element.querySelector(selector) || element;
          }
          return element instanceof Element ? element : null;
        } catch (e) {
          console.error(e);
          return null;
        }
      }

      componentDidMount() {
        this._initMediaQueryListener();
        this._initResizeObserver();
        // Set the size on the next tick. We had issues with wrapped components
        // not adjusting if the size was fixed during mounting.
        this.timeoutId = setTimeout(this._updateSize, 0);
      }

      componentDidUpdate() {
        // update ResizeObserver if element changes
        this._updateResizeObserver();
        this._updateRefreshMode();
      }

      componentWillUnmount() {
        this._teardownResizeObserver();
        this._teardownQueryMediaListener();
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
        }
      }

      _getRefreshMode = () => {
        if (isCypressActive || this._printMediaQuery?.matches) {
          return "none";
        } else if (typeof refreshMode === "function") {
          return refreshMode(this.props);
        } else {
          return refreshMode;
        }
      };

      _updateRefreshMode = () => {
        const nextMode = this._getRefreshMode();
        if (nextMode === this._refreshMode) {
          return;
        }
        if (this._currentElement) {
          resizeObserver.unsubscribe(this._currentElement, this._updateSize);
        }
        const refreshFn = REFRESH_MODE[nextMode];
        this._updateSize = refreshFn(this.__updateSize);
        if (this._currentElement) {
          resizeObserver.subscribe(this._currentElement, this._updateSize);
        }
        this._refreshMode = nextMode;
      };

      _updateSizeAndRefreshMode = () => {
        this._updateRefreshMode();
        this._updateSize();
      };

      // ResizeObserver, ensure re-layout when container element changes size
      _initResizeObserver() {
        this._currentElement = this._getElement();
        if (this._currentElement) {
          resizeObserver.subscribe(this._currentElement, this._updateSize);
        }
      }

      _updateResizeObserver() {
        const element = this._getElement();
        if (this._currentElement !== element) {
          if (this._currentElement) {
            resizeObserver.unsubscribe(this._currentElement, this._updateSize);
          }
          this._currentElement = element;
          if (this._currentElement) {
            resizeObserver.subscribe(this._currentElement, this._updateSize);
          }
        }
      }

      _teardownResizeObserver() {
        if (this._currentElement) {
          resizeObserver.unsubscribe(this._currentElement, this._updateSize);
        }
      }

      // media query listener, ensure re-layout when printing
      _initMediaQueryListener() {
        this._printMediaQuery?.addEventListener(
          "change",
          this._updateSizeAndRefreshMode,
        );
      }

      _teardownQueryMediaListener() {
        this._printMediaQuery?.removeEventListener(
          "change",
          this._updateSizeAndRefreshMode,
        );
      }

      __updateSize = () => {
        const element = this._getElement();
        if (element) {
          const { width, height } = element.getBoundingClientRect();

          if (!width && !height) {
            // cypress raises lots of errors in timeline trying to call setState
            // on the unmounted element, so we're just ignoring
            return;
          }

          if (this.state.width !== width || this.state.height !== height) {
            this.setState({ width, height }, () =>
              this.props?.onUpdateSize?.(),
            );
          }
        }
      };
      render() {
        const { forwardedRef, ...props } = this.props;
        if (wrapped) {
          const { className, style = {}, ...rest } = props;
          const { width, height } = this.state;
          return (
            <div className={cx(className, CS.relative)} style={style}>
              <ComposedComponent
                ref={forwardedRef}
                style={{ position: "absolute", top: 0, left: 0, width, height }}
                {...(rest as unknown as T)}
                {...this.state}
              />
            </div>
          );
        } else {
          return (
            <ComposedComponent
              ref={forwardedRef}
              {...(props as unknown as T)}
              {...this.state}
            />
          );
        }
      }
    }

    return React.forwardRef<
      unknown,
      PropsWithoutRef<ExplicitSizeOuterProps<T>>
    >((props, ref) => (
      <WrappedComponent {...(props as T & InnerProps)} forwardedRef={ref} />
    ));
  };
}

// eslint-disable-next-line import/no-default-export
export default ExplicitSize;
