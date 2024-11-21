import { t } from "ttag";

import { Button } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { ClauseStep } from "../ClauseStep";

type PreviewStepProps = {
  query: Lib.Query | undefined;
};

export function PreviewStep(_props: PreviewStepProps) {
  return (
    <ClauseStep>
      <Button variant="filled">{t`Preview`}</Button>
    </ClauseStep>
  );
}
