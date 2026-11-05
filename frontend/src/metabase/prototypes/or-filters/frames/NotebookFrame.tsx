import type { ReactNode } from "react";
import { t } from "ttag";

import {
  NotebookCell,
  NotebookCellItem,
} from "metabase/querying/notebook/components/NotebookCell";
import { Box, Paper, Stack, Text } from "metabase/ui";

type NotebookFrameProps = {
  children: ReactNode;
};

/** A fake notebook with a Data step above the Filter step under test. */
export function NotebookFrame({ children }: NotebookFrameProps) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="lg">
        <Box>
          <Text fw="bold" c="text-secondary" mb="xs">
            {t`Data`}
          </Text>
          <NotebookCell color="background_surface-brand-strong">
            <NotebookCellItem color="background_surface-brand-strong" readOnly>
              {t`Orders`}
            </NotebookCellItem>
          </NotebookCell>
        </Box>
        <Box>
          <Text fw="bold" c="text-secondary" mb="xs">
            {t`Filter`}
          </Text>
          {children}
        </Box>
      </Stack>
    </Paper>
  );
}
