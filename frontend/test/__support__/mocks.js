global.ga = () => {};
global.snowplow = () => {};

global.window.matchMedia = () => ({
  addEventListener: () => {},
  removeEventListener: () => {},
});

/**
 * jsdom doesn't have scrollBy or scrollTo, so we need to mock it.
 */
global.window.HTMLElement.prototype.scrollBy = jest.fn();
global.window.HTMLElement.prototype.scrollTo = jest.fn();

/**
 * jsdom doesn't have scrollIntoView, so we need to mock it.
 * Used e.g. under the hood in Mantine's Select component.
 */
global.window.HTMLElement.prototype.scrollIntoView = jest.fn();

// jsdom lacks ResizeObserver, and a no-op stub never measures (so consumers like
// @tanstack/react-virtual render nothing); fire one initial callback per observe.
global.window.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this._callback = callback;
    this._elements = new Set();
  }

  observe(element) {
    this._elements.add(element);
    queueMicrotask(() => {
      if (!this._elements.has(element)) {
        return;
      }
      const rect = element.getBoundingClientRect();
      this._callback(
        [
          {
            target: element,
            contentRect: rect,
            borderBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
            contentBoxSize: [
              { inlineSize: rect.width, blockSize: rect.height },
            ],
          },
        ],
        this,
      );
    });
  }

  unobserve(element) {
    this._elements.delete(element);
  }

  disconnect() {
    this._elements.clear();
  }
};

jest.mock("metabase/analytics");

jest.mock("@uiw/react-codemirror", () => {
  const { forwardRef } = jest.requireActual("react");

  const MockEditor = forwardRef((props, ref) => {
    const {
      indentWithTab,
      extensions,
      basicSetup,
      editable,
      // CodeMirror-specific callbacks that React would warn about if spread
      // onto the underlying <textarea>.
      onUpdate,
      onCreateEditor,
      onStatistics,
      ...rest
    } = props;
    return (
      // @ts-expect-error: some props types are different on CodeMirror
      <textarea
        ref={ref}
        {...rest}
        value={props.value ?? ""}
        // @ts-expect-error: We cannot provide the update argument to onChange
        onChange={(evt) => props.onChange?.(evt.target.value, undefined)}
        autoFocus
        disabled={editable === false}
      />
    );
  });

  return {
    __esModule: true,
    ...jest.requireActual("@uiw/react-codemirror"),
    default: MockEditor,
  };
});
