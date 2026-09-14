import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Stack } from "metabase/ui";

export const HiddenFieldEmptyStateBlock = () => (
  <Stack h="100%" justify="center" p="lg">
    <EmptyState message={t`This field is hidden`} />
  </Stack>
);
