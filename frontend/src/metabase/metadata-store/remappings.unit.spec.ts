import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  createMockParameter,
  createMockParameterFieldInfo,
} from "metabase-types/api/mocks";
import { PEOPLE, createSampleDatabase } from "metabase-types/api/mocks/presets";

import { fetchRemapping } from "./remappings";

const idField = createMockParameterFieldInfo({
  id: PEOPLE.ID,
  name: "ID",
  display_name: "ID",
  base_type: "type/BigInteger",
  semantic_type: "type/PK",
  has_field_values: "none",
  has_remapping: true,
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
