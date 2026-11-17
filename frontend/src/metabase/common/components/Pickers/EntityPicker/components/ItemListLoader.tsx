import { t } from "ttag";

import { DelayedSkeleton } from "metabase/common/components/DelayedLoading";
import { Box } from "metabase/ui";

export const ItemListLoader = () => (
  <Box w={365} h="100%" p="1rem" aria-label={t`Loading...`}>
    <DelayedSkeleton />
  </Box>
);
