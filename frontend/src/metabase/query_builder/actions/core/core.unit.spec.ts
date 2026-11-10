import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestTemplateTag } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { setParameterValue } from "../../store/actions";

import { setParameterValueToDefault } from "./core";

const TAG_ID = "category-tag";

interface SetupOpts {
  tag: Partial<TestTemplateTag>;
}

async function setup({ tag }: SetupOpts) {
  const card = createMockCard({
    query_type: "native",
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "select * from products where category = {{category}}",
      templateTags: {
        category: {
          id: TAG_ID,
          name: "category",
          "display-name": "Category",
          type: "text",
          ...tag,
        },
      },
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
