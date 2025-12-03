import { t } from "ttag";

import { Box } from "metabase/ui";

export function CheckDependenciesTitle() {
  return (
    <Box fz="h3" lh="h3">
      {t`These changes will break some other things. Save anyway?`}
    </Box>
  );
}
