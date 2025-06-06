import {
  type ContentTranslationTestSetupOptions,
  setupForContentTranslationTest,
} from "metabase/i18n/test-utils";

import { LegendCaption } from "../LegendCaption";

export interface SetupOpts extends ContentTranslationTestSetupOptions {
  title: string;
  description?: string;
}

export function setup({ title, description, ...options }: SetupOpts) {
  return setupForContentTranslationTest({
    component: <LegendCaption title={title} description={description} />,
    ...options,
  });
}
