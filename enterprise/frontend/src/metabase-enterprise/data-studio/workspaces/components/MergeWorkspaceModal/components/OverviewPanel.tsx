import { msgid, ngettext, t } from "ttag";

import { FormTextarea } from "metabase/forms";
import { Box, Stack, Text } from "metabase/ui";
import type { WorkspaceId } from "metabase-types/api";

import { MAX_COMMIT_MESSAGE_LENGTH } from "../MergeWorkspaceModal";

import { QualityChecksSection } from "./QualityChecksSection";

type OverviewPanelProps = {
  commitMessageLength?: number;
  hasCommitMessageError: boolean;
  workspaceId: WorkspaceId;
  transformCount: number;
};

export const OverviewPanel = ({
  commitMessageLength = 0,
  hasCommitMessageError,
  workspaceId,
  transformCount,
}: OverviewPanelProps) => {
  return (
    <Box p="xl" h="100%" style={{ overflowY: "auto" }}>
      <Stack>
        <Box>
          <Text>{t`This will merge all changes from this workspace back to the source transforms.`}</Text>
          <Text mt="xs">
            {t`The commit message will be used to display the history of transform changes.`}
          </Text>
        </Box>
        <Stack mt="md" gap={0}>
          <FormTextarea
            data-autofocus
            label={t`Commit message`}
            name="commit_message"
            placeholder={t`Describe the changes you made in this workspace...`}
            minRows={4}
            required
          />
          {!hasCommitMessageError && (
            <Text size="sm" c="text-tertiary" pt="sm">
              {commitMessageLength}/{MAX_COMMIT_MESSAGE_LENGTH}
            </Text>
          )}
        </Stack>
        <QualityChecksSection workspaceId={workspaceId} />
        <Box
          p="md"
          style={{
            backgroundColor: "var(--mb-color-background-secondary)",
            borderRadius: "var(--mantine-radius-sm)",
          }}
        >
          <Text>
            {ngettext(
              msgid`${transformCount} transform will be merged`,
              `${transformCount} transforms will be merged`,
              transformCount,
            )}
          </Text>
        </Box>
      </Stack>
    </Box>
  );
};
