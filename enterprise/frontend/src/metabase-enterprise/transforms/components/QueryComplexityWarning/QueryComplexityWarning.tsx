import { t } from "ttag";

import { Alert, Stack } from "metabase/ui";
import { CHECKPOINT_TEMPLATE_TAG } from "metabase-enterprise/transforms/constants";
import type { CheckQueryComplexityResponse } from "metabase-types/api";

type QueryComplexityWarningProps = {
  complexity: CheckQueryComplexityResponse;
};

export const QueryComplexityWarning = ({
  complexity,
}: QueryComplexityWarningProps) => (
  <Alert variant="info" icon="info">
    <Stack gap="xs">
      <span>
        {t`This query is too complex to allow automatic checkpoint column selection. You may need to explicitly add a conditional filter in your query, for example:`}
      </span>
      <code>{`[[ WHERE id > {{${CHECKPOINT_TEMPLATE_TAG}}} ]]`}</code>
      <span>
        {t`Reason: `}
        <strong>{complexity.reason}</strong>
      </span>
    </Stack>
  </Alert>
);
