import type { MouseEventHandler } from "react";
import { t } from "ttag";
import {
  PublicLinkCopyButton,
  ExtensionOption,
  RemoveLinkAnchor,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel.styled";
import { Box, Group, Stack, Text, TextInput, Tooltip } from "metabase/ui";
import type { ExportFormatType } from "./types";

export const PublicLinkCopyPanel = ({
  loading = false,
  url,
  onRemoveLink,
  extensions = [],
  selectedExtension,
  onChangeExtension,
  removeButtonLabel,
  removeTooltipLabel,
}: {
  loading?: boolean;
  url: string | null;
  onRemoveLink?: MouseEventHandler;
  selectedExtension?: ExportFormatType;
  onChangeExtension?: (extension: ExportFormatType) => void;
  extensions?: ExportFormatType[];
  removeButtonLabel?: string;
  removeTooltipLabel?: string;
}) => (
  <Stack>
    <TextInput
      readOnly
      data-testid="public-link-input"
      placeholder={loading ? t`Loading…` : undefined}
      value={url ?? undefined}
      inputWrapperOrder={["label", "input", "error", "description"]}
      rightSection={<PublicLinkCopyButton value={url} />}
      description={
        // The box is needed to center the tooltip on the anchor
        <Stack ml="xs" spacing={0} mt="sm" pos="absolute">
          {extensions && extensions.length > 0 && (
            <Group mb="sm">
              {extensions.map(extension => (
                <ExtensionOption
                  data-testid="extension-option"
                  key={extension}
                  isSelected={extension === selectedExtension}
                  onClick={() =>
                    onChangeExtension?.(
                      extension === selectedExtension ? null : extension,
                    )
                  }
                >
                  {extension}
                </ExtensionOption>
              ))}
            </Group>
          )}
          {onRemoveLink && (
            <Box>
              <Tooltip
                label={
                  <Text fw={700} c="inherit">
                    {removeTooltipLabel}
                  </Text>
                }
              >
                <RemoveLinkAnchor
                  fz="sm"
                  c="error.0"
                  fw={700}
                  onClick={onRemoveLink}
                >
                  {removeButtonLabel}
                </RemoveLinkAnchor>
              </Tooltip>
            </Box>
          )}
        </Stack>
      }
    />
  </Stack>
);
