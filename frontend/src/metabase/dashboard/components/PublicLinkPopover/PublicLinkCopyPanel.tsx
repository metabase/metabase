import type { MouseEventHandler } from "react";
import { t } from "ttag";
import {
  PublicLinkCopyButton,
  RemoveLinkAnchor,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel.styled";
import {
  Anchor,
  Box,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
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
  <Stack spacing={0}>
    <TextInput
      readOnly
      data-testid="public-link-input"
      placeholder={loading ? t`Loading…` : undefined}
      value={url ?? undefined}
      inputWrapperOrder={["label", "input", "error", "description"]}
      rightSection={<PublicLinkCopyButton value={url} />}
    />
    <Box pos="relative">
      <Group mt="sm" pos="absolute" w="100%" position="apart" align="center">
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
              <RemoveLinkAnchor
                fz="sm"
                c="error"
                fw={700}
                onClick={onRemoveLink}
              >
                {removeButtonLabel}
              </RemoveLinkAnchor>
            </Tooltip>
          )}
        </Box>
        <Group spacing="sm" position="right">
          {extensions &&
            extensions.length > 0 &&
            extensions.map(extension => (
              <Anchor
                data-testid="extension-option"
                key={extension}
                tt="uppercase"
                c={extension === selectedExtension ? "brand" : "text-light"}
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
      </Group>
    </Box>
  </Stack>
);
