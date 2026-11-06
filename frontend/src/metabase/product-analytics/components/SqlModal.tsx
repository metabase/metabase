import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { Box, FocusTrap, Modal } from "metabase/ui";

type SqlModalProps = {
  sql: string | null;
  opened: boolean;
  onClose: () => void;
};

export const SqlModal = ({ sql, opened, onClose }: SqlModalProps) => {
  const value = sql ?? t`SQL will appear here after the query runs.`;

  return (
    <Modal title={t`SQL`} size="xl" opened={opened} onClose={onClose}>
      <FocusTrap.InitialFocus />
      <Box pos="relative" pr="xl" pt="lg">
        <CodeEditor value={value} language="sql" readOnly />
        {sql != null && (
          <Box p="sm" pos="absolute" right={0} top={0}>
            <CopyButton value={sql} />
          </Box>
        )}
      </Box>
    </Modal>
  );
};
