import type {
  OmniPickerDatabaseItem,
  OmniPickerMeasureItem,
  OmniPickerTableItem,
} from "../EntityPicker";

import { getItemNotInDbTooltip } from "./utils";

const CROSS_DB_TOOLTIP = "You can't combine data from different databases.";

const databaseItem = (id: number): OmniPickerDatabaseItem => ({
  model: "database",
  id,
  name: `DB ${id}`,
});

const tableItem = (id: number, databaseId: number): OmniPickerTableItem => ({
  model: "table",
  id,
  database_id: databaseId,
  name: `Table ${id}`,
});

describe("getItemNotInDbTooltip", () => {
  it("explains why a database from another database is disabled", () => {
    const getTooltip = getItemNotInDbTooltip(1);
    expect(getTooltip(databaseItem(2))).toBe(CROSS_DB_TOOLTIP);
  });

  it("does not explain the database the picker is locked to", () => {
    const getTooltip = getItemNotInDbTooltip(1);
    expect(getTooltip(databaseItem(1))).toBeUndefined();
  });

  it("explains why a table from another database is disabled", () => {
    const getTooltip = getItemNotInDbTooltip(1);
    expect(getTooltip(tableItem(10, 2))).toBe(CROSS_DB_TOOLTIP);
  });

  it("does not explain a table in the locked database", () => {
    const getTooltip = getItemNotInDbTooltip(1);
    expect(getTooltip(tableItem(10, 1))).toBeUndefined();
  });

  it("returns undefined when the picker is not locked to a database", () => {
    const getTooltip = getItemNotInDbTooltip(undefined);
    expect(getTooltip(databaseItem(2))).toBeUndefined();
    expect(getTooltip(tableItem(10, 2))).toBeUndefined();
  });

  it("returns undefined for item types that don't belong to a single database (e.g. measures)", () => {
    const getTooltip = getItemNotInDbTooltip(1);
    const measureItem: OmniPickerMeasureItem = {
      model: "measure",
      id: 5,
      name: "A measure",
    };
    expect(getTooltip(measureItem)).toBeUndefined();
  });
});
