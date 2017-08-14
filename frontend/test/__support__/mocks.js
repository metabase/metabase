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

import * as modal from "metabase/components/Modal";
modal.default = modal.TestModal;

import * as tooltip from "metabase/components/Tooltip";
tooltip.default = tooltip.TestTooltip

import * as popover from "metabase/components/Popover";
popover.default = popover.TestPopover

import * as bodyComponent from "metabase/components/BodyComponent";
bodyComponent.default = bodyComponent.TestBodyComponent

import * as table from "metabase/visualizations/visualizations/Table";
table.default = table.TestTable

