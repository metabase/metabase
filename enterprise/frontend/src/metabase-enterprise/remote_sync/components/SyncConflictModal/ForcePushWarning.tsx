import { useState } from "react";
import { c, msgid, ngettext, t } from "ttag";

import {
  Anchor,
  Box,
  Collapse,
  Group,
  Icon,
  List,
  Stack,
  Text,
} from "metabase/ui";
import type { ForcePushCasualties } from "metabase-types/api";

interface ForcePushWarningProps {
  casualties: ForcePushCasualties;
  branch: string;
  /**
   * The remote's history was rewritten (force-pushed/rebased upstream) so there's no common base. The
   * whole remote is foreign content that a force push replaces wholesale, so we add an explanation.
   */
  historyRewritten?: boolean;
}

/**
 * Spells out what a force push to `branch` would discard: files that exist only on the remote are
 * permanently deleted, and remote-side edits are overwritten by this instance's version. Shows the
 * counts and an expandable list of the affected entities. Renders nothing when there's nothing to lose.
 */
export const ForcePushWarning = ({
  casualties,
  branch,
  historyRewritten,
}: ForcePushWarningProps) => {
  const { deleted, overwritten } = casualties;
  const [expanded, setExpanded] = useState(false);

  const total = deleted.length + overwritten.length;
  if (total === 0) {
    return null;
  }

  const deletedText =
    deleted.length > 0
      ? ngettext(
          msgid`${deleted.length} file on ${branch} that isn’t here will be permanently deleted`,
          `${deleted.length} files on ${branch} that aren’t here will be permanently deleted`,
          deleted.length,
        )
      : null;
  const overwrittenText =
    overwritten.length > 0
      ? ngettext(
          msgid`${overwritten.length} file’s changes on ${branch} will be discarded and overwritten`,
          `${overwritten.length} files’ changes on ${branch} will be discarded and overwritten`,
          overwritten.length,
        )
      : null;

  return (
    <Box
      mt="md"
      p="md"
      bg="background_surface-error-subtle"
      style={{ borderRadius: "var(--mantine-radius-md)" }}
    >
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon name="warning" c="error" mt="2px" />
        <Box>
          {historyRewritten && (
            <Text fw="bold" mb="xs">
              {t`The remote branch’s history was rewritten, so there’s no common base. Force pushing replaces it entirely with this instance’s content:`}
            </Text>
          )}
          <Stack gap="xs">
            {deletedText && (
              <Text fw="bold" c="error">
                {deletedText}
              </Text>
            )}
            {overwrittenText && <Text fw="bold">{overwrittenText}</Text>}
          </Stack>
          <Anchor
            component="button"
            type="button"
            size="sm"
            mt="xs"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t`Hide files` : t`Show files`}
          </Anchor>
          <Collapse in={expanded}>
            <Stack gap="sm" mt="sm">
              {deleted.length > 0 && (
                <Box>
                  <Text size="sm" fw="bold" mb="xs">
                    {c("Header for a list of files that will be deleted")
                      .t`Will be deleted`}
                  </Text>
                  <List spacing="xs" size="sm" withPadding>
                    {deleted.map((label) => (
                      <List.Item key={label}>{label}</List.Item>
                    ))}
                  </List>
                </Box>
              )}
              {overwritten.length > 0 && (
                <Box>
                  <Text size="sm" fw="bold" mb="xs">
                    {c("Header for a list of files that will be overwritten")
                      .t`Will be overwritten`}
                  </Text>
                  <List spacing="xs" size="sm" withPadding>
                    {overwritten.map((label) => (
                      <List.Item key={label}>{label}</List.Item>
                    ))}
                  </List>
                </Box>
              )}
            </Stack>
          </Collapse>
        </Box>
      </Group>
    </Box>
  );
};
