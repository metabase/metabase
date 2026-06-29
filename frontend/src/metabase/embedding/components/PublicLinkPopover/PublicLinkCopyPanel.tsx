import type { MouseEventHandler } from "react";
import { t } from "ttag";

import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import type { ExportFormat } from "metabase/common/types/export";
import { Anchor, Box, Group, Stack, Text, Tooltip } from "metabase/ui";

export const PublicLinkCopyPanel = ({
  loading = false,
  url,
  onRemoveLink,
  extensions = [],
  selectedExtension,
  onChangeExtension,
  removeButtonLabel,
  removeTooltipLabel,
  onCopy,
}: {
  loading?: boolean;
  url: string | null;
  onRemoveLink?: MouseEventHandler;
  selectedExtension?: ExportFormat | null;
  onChangeExtension?: (extension: ExportFormat | null) => void;
  extensions?: ExportFormat[];
  removeButtonLabel?: string;
  removeTooltipLabel?: string;
  onCopy?: () => void;
}) => (
  <Stack gap={0}>
    <CopyTextInput
      data-testid="public-link-input"
      placeholder={loading ? t`Loading…` : undefined}
      value={url ?? ""}
      onCopied={onCopy}
    />
    <Group mt="sm" justify="space-between" align="center">
      <Group gap="sm">
        {extensions &&
          extensions.length > 0 &&
          extensions.map((extension) => (
            <Anchor
              data-testid="extension-option"
              key={extension}
              tt="uppercase"
              c={
                extension === selectedExtension ? "core-brand" : "text-disabled"
              }
              fw={700}
              onClick={() =>
                onChangeExtension?.(
                  extension === selectedExtension ? null : extension,
                )
              }
            >
              {extension}
            </Anchor>
          ))}
      </Group>
      <Box>
        {onRemoveLink && (
          // The container is needed to center the tooltip on the anchor
          <Tooltip
            label={
              <Text fw={700} c="inherit">
                {removeTooltipLabel}
              </Text>
            }
          >
            <Anchor
              component="button"
              style={{ whiteSpace: "nowrap" }}
              fz="sm"
              c="error"
              fw={700}
              onClick={onRemoveLink}
            >
              {removeButtonLabel}
            </Anchor>
          </Tooltip>
        )}
      </Box>
    </Group>
  </Stack>
);
