import {
  type ContentTranslationTestSetupOptions,
  setupForContentTranslationTest,
} from "metabase/i18n/test-utils";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { createMockParameter } from "metabase-types/api/mocks";

export function setup(options: ContentTranslationTestSetupOptions) {
  const parameter: FieldFilterUiParameter = {
    ...createMockParameter({
      id: "1fe8ce3",
      type: "string/contains",
      slug: "text_contains",
      name: "Text contains",
      value: "a",
    }),
    fields: [],
  };

  const setValue = jest.fn();

  const utils = setupForContentTranslationTest({
    ...options,
    component: <ParameterWidget parameter={parameter} setValue={setValue} />,
  });

  return { ...utils, setValue };
}
