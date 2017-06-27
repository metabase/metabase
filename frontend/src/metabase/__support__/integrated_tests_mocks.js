import React from 'react'

global.ga = () => {}
global.ace.define = () => {}
global.ace.require = () => {}

global.window.matchMedia = () => ({ addListener: () => {}, removeListener: () => {} })

jest.mock('metabase/lib/analytics');

jest.mock("ace/ace", () => {}, {virtual: true});
jest.mock("ace/mode-plain_text", () => {}, {virtual: true});
jest.mock("ace/mode-javascript", () => {}, {virtual: true});
jest.mock("ace/mode-json", () => {}, {virtual: true});
jest.mock("ace/mode-clojure", () => {}, {virtual: true});
jest.mock("ace/mode-ruby", () => {}, {virtual: true});
jest.mock("ace/mode-html", () => {}, {virtual: true});
jest.mock("ace/mode-jsx", () => {}, {virtual: true});
jest.mock("ace/mode-sql", () => {}, {virtual: true});
jest.mock("ace/mode-mysql", () => {}, {virtual: true});
jest.mock("ace/mode-pgsql", () => {}, {virtual: true});
jest.mock("ace/mode-sqlserver", () => {}, {virtual: true});
jest.mock("ace/snippets/sql", () => {}, {virtual: true});
jest.mock("ace/snippets/mysql", () => {}, {virtual: true});
jest.mock("ace/snippets/pgsql", () => {}, {virtual: true});
jest.mock("ace/snippets/sqlserver", () => {}, {virtual: true});
jest.mock("ace/snippets/json", () => {}, {virtual: true});
jest.mock("ace/snippets/json", () => {}, {virtual: true});
jest.mock("ace/ext-language_tools", () => {}, {virtual: true});

// TODO Atte Keinänen 6/22/17: Write functional mock implementations of Modal and Tooltip
// We can't use the original classes because they do DOM mutation
jest.mock("metabase/components/Modal", () => {
    const MockedModal = () => <div className="mocked-modal" />
    return MockedModal
});
jest.mock("metabase/components/Tooltip", () => {
    const MockedTooltip = ({ children }) => <div className="mocked-tooltip" >{ children }</div>
    return MockedTooltip
});

