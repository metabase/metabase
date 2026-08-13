import { t } from "ttag";

import { Box, List, Text } from "metabase/ui";

interface ConflictingChangesListProps {
  conflicts: string[];
}

/**
 * Lists the entities that were changed both locally and on the remote branch and therefore can't be
 * merged automatically. Shown in the push conflict modal when a 3-way merge isn't clean.
 */
export const ConflictingChangesList = ({
  conflicts,
}: ConflictingChangesListProps) => (
  <Box>
    <Text mb="sm">
      {t`These items were changed both here and on the remote branch, so they can't be merged automatically:`}
    </Text>
    <List spacing="xs" size="sm" withPadding>
      {conflicts.map((conflict) => (
        <List.Item key={conflict}>{conflict}</List.Item>
      ))}
    </List>
  </Box>
);
