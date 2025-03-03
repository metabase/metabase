global.ga = () => {};
global.snowplow = () => {};
global.ace.define = () => {};
global.ace.require = () => {};

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

jest.mock("ace/ace", () => {}, { virtual: true });
jest.mock("ace/ext-searchbox", () => {}, { virtual: true });
jest.mock("ace/mode-plain_text", () => {}, { virtual: true });
jest.mock("ace/mode-javascript", () => {}, { virtual: true });
jest.mock("ace/mode-json", () => {}, { virtual: true });
jest.mock("ace/mode-clojure", () => {}, { virtual: true });
jest.mock("ace/mode-ruby", () => {}, { virtual: true });
jest.mock("ace/mode-python", () => {}, { virtual: true });
jest.mock("ace/mode-html", () => {}, { virtual: true });
jest.mock("ace/mode-jsx", () => {}, { virtual: true });
jest.mock("ace/mode-jade", () => {}, { virtual: true });
jest.mock("ace/mode-html_ruby", () => {}, { virtual: true });
jest.mock("ace/mode-sql", () => {}, { virtual: true });
jest.mock("ace/snippets/text", () => {}, { virtual: true });
jest.mock("ace/snippets/sql", () => {}, { virtual: true });
jest.mock("ace/snippets/json", () => {}, { virtual: true });
jest.mock("ace/snippets/json", () => {}, { virtual: true });
jest.mock("ace/ext-language_tools", () => {}, { virtual: true });

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
