import {
  type ContentTranslationTestSetupOptions,
  setupForContentTranslationTest,
} from "metabase/i18n/test-utils";

import { TitleAndDescription } from "../TitleAndDescription";

export const setup = (options: ContentTranslationTestSetupOptions = {}) => {
  return setupForContentTranslationTest({
    ...options,
    component: (
      <TitleAndDescription
        title={"Sample Heading"}
        description={"Sample Description"}
      />
    ),
  });
};
