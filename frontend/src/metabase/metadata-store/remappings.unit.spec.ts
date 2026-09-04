import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import { createMockEntitiesState } from "__support__/store";
import { createMockState } from "metabase/redux/store/mocks";
import type { ParameterField } from "metabase-lib/v1/parameters/types";
import { createMockField, createMockParameter } from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { addRemappings, fetchRemapping } from "./remappings";
import { getFieldRemappings } from "./selectors";

// the shape the backend hydrates into `param_fields`: a plain object with the
// remap target nested, and none of the v1 wrapper's methods
const idField: ParameterField = createMockField({
  id: PEOPLE.ID,
  table_id: PEOPLE_ID,
  name: "ID",
  display_name: "ID",
  base_type: "type/BigInteger",
  semantic_type: "type/PK",
  has_field_values: "none",
  name_field: createMockField({
    id: PEOPLE.NAME,
    table_id: PEOPLE_ID,
    name: "NAME",
    display_name: "Name",
    base_type: "type/Text",
    semantic_type: "type/Name",
    has_field_values: "list",
  }),
});

const parameter = createMockParameter({
  id: "p1",
  type: "id",
  sectionId: "id",
});

const setup = () =>
  getMainStore(
    createMockState({
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
      }),
    }),
  );

describe("fetchRemapping", () => {
  it("stores the label a plain param_fields field has no method to report", async () => {
    fetchMock.post("path:/api/dataset/parameter/remapping", [
      2,
      "Domenica Williamson",
    ]);

    const store = setup();
    await store.dispatch(
      fetchRemapping({ parameter, value: 2, field: idField }),
    );

    expect(getFieldRemappings(store.getState(), PEOPLE.ID)).toEqual([
      [2, "Domenica Williamson"],
    ]);
  });

  it("does not fetch a label the store already holds", async () => {
    fetchMock.post("path:/api/dataset/parameter/remapping", [
      2,
      "Domenica Williamson",
    ]);

    const store = setup();
    store.dispatch(addRemappings(PEOPLE.ID, [[2, "Domenica Williamson"]]));

    await store.dispatch(
      fetchRemapping({ parameter, value: 2, field: idField }),
    );

    expect(
      fetchMock.callHistory.calls("path:/api/dataset/parameter/remapping"),
    ).toHaveLength(0);
  });
});
