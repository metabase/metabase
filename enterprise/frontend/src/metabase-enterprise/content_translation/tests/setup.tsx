import {
  type ContentTranslationTestSetupOptions,
  setupForContentTranslationTest,
} from "metabase/i18n/test-utils";

import { useTranslateContent } from "../use-translate-content";

interface SetupOpts extends ContentTranslationTestSetupOptions {
  /** An untranslated string */
  msgid: string | null | undefined;
}

const TestComponent = ({ msgid }: { msgid?: string | null }) => {
  const tc = useTranslateContent();
  const msgstr = tc(msgid);
  return <>{msgstr}</>;
};

export function setup({ msgid, ...options }: SetupOpts) {
  return setupForContentTranslationTest({
    ...options,
    component: <TestComponent msgid={msgid} />,
  });
}
