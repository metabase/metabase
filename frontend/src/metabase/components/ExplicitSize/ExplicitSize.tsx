import cx from "classnames";
import debounce from "lodash.debounce";
import type { CSSProperties, ComponentType } from "react";
import { Component } from "react";
import ReactDOM from "react-dom";
import _ from "underscore";

import { waitTimeContext } from "metabase/context/wait-time";
import CS from "metabase/css/core/index.css";
import { isCypressActive } from "metabase/env";
import resizeObserver from "metabase/lib/resize-observer";

const WAIT_TIME = 300;

const REFRESH_MODE = {
  throttle: (fn: () => void) => _.throttle(fn, WAIT_TIME),
  debounce: (fn: () => void) => debounce(fn, WAIT_TIME),
  // Using lodash.debounce with leading=true to execute the function immediately and also at the end of the debounce period.
  // Underscore debounce with immediate=true will not execute the function after the wait period unless it is called again.
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

type BaseInnerProps = {
  className?: string;
  style?: CSSProperties;
  onUpdateSize?: () => void;
};

function ExplicitSize<T extends BaseInnerProps>({
  selector,
  wrapped = false,
  refreshMode = "throttle",
}: ExplicitSizeProps<T> = {}) {
  return (ComposedComponent: ComponentType<T & SizeState>) => {
    const displayName = ComposedComponent.displayName || ComposedComponent.name;

    class WrappedComponent extends Component<T> {
      static contextType = waitTimeContext;

      static displayName = `ExplicitSize[${displayName}]`;

      state: SizeState;

      timeoutId: ReturnType<typeof setTimeout> | null = null;

      _currentElement: Element | null = null;

      _printMediaQuery = window.matchMedia && window.matchMedia("print");

      _refreshMode: RefreshMode;

      _updateSize: () => void;

      constructor(props: T, context: unknown) {
        super(props, context);
        this.state = {
          width: null,
          height: null,
        };

        this._printMediaQuery = window.matchMedia && window.matchMedia("print");
        if (this.context === 0) {
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
        if (wrapped) {
          const { className, style = {}, ...props } = this.props;
          const { width, height } = this.state;
          return (
            <div className={cx(className, CS.relative)} style={style}>
              <ComposedComponent
                style={{ position: "absolute", top: 0, left: 0, width, height }}
                {...(props as T)}
                {...this.state}
              />
            </div>
          );
        } else {
          return <ComposedComponent {...this.props} {...this.state} />;
        }
      }
    }

    return WrappedComponent;
  };
}

// eslint-disable-next-line import/no-default-export
export default ExplicitSize;
