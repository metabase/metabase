import { t } from "ttag";
import {
  PublicLinkCopyButton,
  ExtensionOption,
  RemoveLinkAnchor,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel.styled";
import type { exportFormats } from "metabase/lib/urls";
import { Box, Group, Stack, Text, TextInput, Tooltip } from "metabase/ui";

export type ExportFormatType = typeof exportFormats[number] | null;

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
  onRemoveLink?: () => void;
  selectedExtension?: ExportFormatType;
  onChangeExtension?: (extension: ExportFormatType) => void;
  extensions?: ExportFormatType[];
  removeButtonLabel?: string;
  removeTooltipLabel?: string;
}) => {
  return (
    <Stack>
      <TextInput
        readOnly
        placeholder={loading ? t`Loading…` : undefined}
        value={url ?? undefined}
        inputWrapperOrder={["label", "input", "error", "description"]}
        rightSection={<PublicLinkCopyButton value={url} />}
        description={
          onRemoveLink && (
            // The box is needed to center the tooltip on the anchor
            <Box pos="absolute" mt="sm">
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
          )
        }
      />
      {extensions && extensions.length > 0 && (
        <Group my="sm">
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
    </Stack>
  );
};
