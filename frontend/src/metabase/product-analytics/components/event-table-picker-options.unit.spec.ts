import type { OmniPickerItem } from "metabase/common/components/Pickers";

import { getEventTablePickerOptions } from "./event-table-picker-options";

const SET_UP_TABLE: OmniPickerItem = {
  model: "table",
  id: 1,
  database_id: 1,
  name: "Events",
};

const OTHER_TABLE: OmniPickerItem = {
  model: "table",
  id: 2,
  database_id: 1,
  name: "Orders",
};

const SCHEMA: OmniPickerItem = {
  model: "schema",
  id: "PUBLIC",
  name: "PUBLIC",
  database_id: 1,
};

type SetupOpts = {
  canSetUpTables: boolean;
};

const setup = ({ canSetUpTables }: SetupOpts) => {
  const { shouldDisableItem, options } = getEventTablePickerOptions({
    setUpTableIds: new Set([SET_UP_TABLE.id]),
    canSetUpTables,
  });
  return {
    shouldDisableItem,
    getItemTooltip: (item: OmniPickerItem) => options.getItemTooltip?.(item),
    options,
  };
};

describe("getEventTablePickerOptions", () => {
  it("disables tables that aren't set up for someone who can't set them up, and says why", () => {
    const { shouldDisableItem, getItemTooltip } = setup({
      canSetUpTables: false,
    });

    expect(shouldDisableItem(OTHER_TABLE)).toBe(true);
    expect(getItemTooltip(OTHER_TABLE)).toBe(
      "This table isn't set up for product analysis. Ask an admin to set it up in Data Studio.",
    );
    expect(shouldDisableItem(SET_UP_TABLE)).toBe(false);
    expect(getItemTooltip(SET_UP_TABLE)).toBeUndefined();
    expect(shouldDisableItem(SCHEMA)).toBe(false);
  });

  it("lets someone who can set up tables pick any table", () => {
    const { shouldDisableItem, getItemTooltip } = setup({
      canSetUpTables: true,
    });

    expect(shouldDisableItem(OTHER_TABLE)).toBe(false);
    expect(getItemTooltip(OTHER_TABLE)).toBeUndefined();
  });

  it("leaves out the collections tables can't be in", () => {
    const { options } = setup({ canSetUpTables: true });

    expect(options).toMatchObject({
      hasRootCollection: false,
      hasPersonalCollections: false,
    });
    expect(options.hasLibrary).toBeUndefined();
  });
});
