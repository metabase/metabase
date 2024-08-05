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
