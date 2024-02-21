import { freeze } from "immer";

import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import {
  createOrdersTaxDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";

describe("findColumnIndexesFromLegacyRefs", () => {
  it("works even on frozen columns and refs", () => {
    const query = createQuery();
    const stageIndex = -1;
    const columns = freeze(
      [createOrdersTotalDatasetColumn(), createOrdersTaxDatasetColumn()],
      true,
    );

    const columnIndexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      columns,
      columns.map(({ field_ref }) => field_ref!),
    );

    expect(Object.isFrozen(columns[0])).toBe(true);
    expect(Object.isFrozen(columns[1])).toBe(true);
    expect(columnIndexes).toEqual([0, 1]);
  });
});
