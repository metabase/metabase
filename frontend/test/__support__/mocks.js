global.ga = () => {};
global.snowplow = () => {};

global.window.matchMedia = () => ({
  addEventListener: () => {},
  removeEventListener: () => {},
});

global.window.ResizeObserver = class ResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
};

jest.mock("metabase/lib/analytics");

jest.mock("@uiw/react-codemirror", () => {
  const { forwardRef } = jest.requireActual("react");

  const MockEditor = forwardRef((props, ref) => {
    const { indentWithTab, extensions, ...rest } = props;
    return (
      // @ts-expect-error: some props types are different on CodeMirror
      <textarea
        ref={ref}
        {...rest}
        value={props.value ?? ""}
        // @ts-expect-error: We cannot provide the update argument to onChange
        onChange={evt => props.onChange?.(evt.target.value, undefined)}
        autoFocus
      />
    );
  });

  return {
    __esModule: true,
    ...jest.requireActual("@uiw/react-codemirror"),
    default: MockEditor,
  };
});
