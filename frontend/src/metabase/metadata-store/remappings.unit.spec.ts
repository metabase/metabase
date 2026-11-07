import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import type { ParameterField } from "metabase-lib/v1/parameters/types";
import { createMockField, createMockParameter } from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { fetchRemapping } from "./remappings";

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
  it("should return label from parameter remapping endpoint", async () => {
    fetchMock.post("path:/api/dataset/parameter/remapping", [
      2,
      "Domenica Williamson",
    ]);

    const store = setup();
    const result = await store.dispatch(
      fetchRemapping({ parameter, value: 2, field: idField }),
    );

    expect(result.payload).toEqual([2, "Domenica Williamson"]);
  });

  it("should request each value once", async () => {
    fetchMock.post("path:/api/dataset/parameter/remapping", [
      2,
      "Domenica Williamson",
    ]);

    const store = setup();
    await store.dispatch(
      fetchRemapping({ parameter, value: 2, field: idField }),
    );
    await store.dispatch(
      fetchRemapping({ parameter, value: 2, field: idField }),
    );

    expect(
      fetchMock.callHistory.calls("path:/api/dataset/parameter/remapping"),
    ).toHaveLength(1);
  });
});
