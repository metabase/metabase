import {
  createTestStore,
  useSharedAdminLogin,
} from "__support__/integrated_tests";
import {
  deleteFieldDimension,
  fetchTableMetadata,
  fetchFieldValues,
  updateFieldDimension,
  updateFieldValues,
} from "metabase/redux/metadata";
import { makeGetMergedParameterFieldValues } from "metabase/selectors/metadata";

const REVIEW_RATING_ID = 33;
const PRODUCT_CATEGORY_ID = 21;

// NOTE Atte Keinänen 9/14/17: A hybrid of an integration test and a method unit test
// I wanted to use a real state tree and have a realistic field remapping scenario

describe("makeGetMergedParameterFieldValues", () => {
  beforeAll(async () => {
    useSharedAdminLogin();

    // add remapping
    const store = await createTestStore();

    await store.dispatch(
      updateFieldDimension(REVIEW_RATING_ID, {
        type: "internal",
        name: "Rating Description",
        human_readable_field_id: null,
      }),
    );
    await store.dispatch(
      updateFieldValues(REVIEW_RATING_ID, [
        [1, "Awful"],
        [2, "Unpleasant"],
        [3, "Meh"],
        [4, "Enjoyable"],
        [5, "Perfecto"],
      ]),
    );
  });

  afterAll(async () => {
    const store = await createTestStore();

    await store.dispatch(deleteFieldDimension(REVIEW_RATING_ID));
    await store.dispatch(
      updateFieldValues(REVIEW_RATING_ID, [
        [1, "1"],
        [2, "2"],
        [3, "3"],
        [4, "4"],
        [5, "5"],
      ]),
    );
  });

  it("should return empty array if no field ids", async () => {
    const store = await createTestStore();
    await store.dispatch(fetchTableMetadata(3));

    const getMergedParameterFieldValues = makeGetMergedParameterFieldValues();
    expect(
      getMergedParameterFieldValues(store.getState(), {
        parameter: { field_ids: [] },
      }),
    ).toEqual([]);
  });

  it("should return the original field values if a single field id", async () => {
    const store = await createTestStore();
    await store.dispatch(fetchTableMetadata(3));
    await store.dispatch(fetchFieldValues(PRODUCT_CATEGORY_ID));

    const getMergedParameterFieldValues = makeGetMergedParameterFieldValues();
    expect(
      getMergedParameterFieldValues(store.getState(), {
        parameter: { field_ids: [PRODUCT_CATEGORY_ID] },
      }),
    ).toEqual([["Doohickey"], ["Gadget"], ["Gizmo"], ["Widget"]]);
  });

  it("should merge and sort field values if multiple field ids", async () => {
    const store = await createTestStore();
    await store.dispatch(fetchTableMetadata(3));
    await store.dispatch(fetchTableMetadata(4));
    await store.dispatch(fetchFieldValues(PRODUCT_CATEGORY_ID));
    await store.dispatch(fetchFieldValues(REVIEW_RATING_ID));

    const getMergedParameterFieldValues = makeGetMergedParameterFieldValues();
    expect(
      getMergedParameterFieldValues(store.getState(), {
        parameter: { field_ids: [PRODUCT_CATEGORY_ID, REVIEW_RATING_ID] },
      }),
    ).toEqual([
      [1, "Awful"],
      ["Doohickey"],
      [4, "Enjoyable"],
      ["Gadget"],
      ["Gizmo"],
      [3, "Meh"],
      [5, "Perfecto"],
      [2, "Unpleasant"],
      ["Widget"],
    ]);
  });
});
