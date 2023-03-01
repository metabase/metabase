import { Database, Field, Table } from "metabase-types/api";
import { createMockDatabase } from "./database";
import { createMockField } from "./field";
import { createMockTable } from "./table";

export const createSampleDatabase = (opts?: Partial<Database>): Database =>
  createMockDatabase({
    id: 1,
    name: "Sample Database",
    tables: [createPeopleTable()],
    is_sample: true,
    ...opts,
  });

export const createPeopleTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: 2,
    db_id: 1,
    name: "PEOPLE",
    display_name: "People",
    schema: "PUBLIC",
    fields: [createPeopleAddressField(), createPeopleBirthDateField()],
    ...opts,
  });

export const createPeopleAddressField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 8,
    table_id: 2,
    name: "ADDRESS",
    display_name: "Address",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...opts,
  });

export const createPeopleBirthDateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 9,
    table_id: 2,
    name: "BIRTH_DATE",
    display_name: "Birth Date",
    base_type: "type/Date",
    semantic_type: "type/Date",
    ...opts,
  });
