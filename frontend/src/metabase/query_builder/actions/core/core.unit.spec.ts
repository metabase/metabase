import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import type { TemplateTag } from "metabase-types/api";
import {
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
  createSavedNativeCard,
} from "metabase-types/api/mocks/presets";

import { setParameterValue } from "../../store/actions";

import { setParameterValueToDefault } from "./core";

const TAG_ID = "category-tag";

interface SetupOpts {
  tag: Partial<TemplateTag>;
}

async function setup({ tag }: SetupOpts) {
  const card = createSavedNativeCard({
    dataset_query: createMockNativeDatasetQuery({
      database: SAMPLE_DB_ID,
      native: createMockNativeQuery({
        query: "select * from products where category = {{category}}",
        "template-tags": {
          category: createMockTemplateTag({
            id: TAG_ID,
            name: "category",
            "display-name": "Category",
            type: "text",
            ...tag,
          }),
        },
      }),
    }),
  });
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
    qb: createMockQueryBuilderState({ card }),
  });
  const dispatch = jest.fn();

  await setParameterValueToDefault(TAG_ID)(dispatch, () => state);

  return { dispatch };
}

describe("setParameterValueToDefault", () => {
  it("should set the parameter value to the default value of its template tag", async () => {
    const { dispatch } = await setup({ tag: { default: "Gizmo" } });

    expect(dispatch).toHaveBeenCalledWith(setParameterValue(TAG_ID, "Gizmo"));
  });

  it("should not set a value when the template tag has no default value", async () => {
    const { dispatch } = await setup({ tag: { default: undefined } });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: setParameterValue.toString() }),
    );
  });
});
