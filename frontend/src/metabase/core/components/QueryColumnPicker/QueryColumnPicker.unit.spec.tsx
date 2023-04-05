// import React from "react";
// import _ from "underscore"
// import { render, screen } from "__support__/ui";
// import type { Table } from "metabase-types/api";
// import {
//   createOrdersTable,
//   createProductsTable,
//   createPeopleTable,
// } from "metabase-types/api/mocks/presets";
// import type { Field } from "metabase-lib/types";
// import FieldPicker from "./FieldPicker";

// type SetupOpts = {
//   tables?: Table[];
//   sourceTable?: Table;
//   extraFields?: Field[];
// };

// function setup({
//   sourceTable: _sourceTable = createOrdersTable(),
//   tables: _tables = [_sourceTable, createProductsTable(), createPeopleTable()],
//   extraFields = []
// }: SetupOpts) {
//   const onSelect = jest.fn();
//   const onClose = jest.fn();

//   const sourceTable = _.omit(_sourceTable, "fields");
//   const tables = _tables.map(table => _.omit(table, "fields"));
//   const fields = _tables.flatMap(table => table.fields).concat(extraFields);

//   render(
//     <FieldPicker
//       tables={tables}
//       sourceTable={sourceTable}
//       onSelect={onSelect}
//       onClose={onClose}
//     />,
//   );
//   return { onSelect, onClose };
// }
