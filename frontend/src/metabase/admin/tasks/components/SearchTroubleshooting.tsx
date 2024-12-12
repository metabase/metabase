import { t } from "ttag";

import { useSearchReindexMutation } from "metabase/api";
import { Box, Button, Text, Title } from "metabase/ui";

export function SearchTroubleShooting() {
  const [reindex, { isLoading }] = useSearchReindexMutation();

  return (
    <Box>
      <Title mb="lg">{t`Search indexing`}</Title>
      <Text mb="lg" maw="30rem">
        {t`If you are having trouble with search indexing, you can reindex your data. Note: this is a heavy operation and should not be done unless you are seeing major search issues.`}
      </Text>
      <Button variant="filled" loading={isLoading} onClick={() => reindex()}>
        {t`Reindex now`}
      </Button>
    </Box>
  );
}
