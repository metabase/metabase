import { t } from "ttag";
import { ExtensionOption } from "metabase/public/components/widgets/SharingPane/SharingPane.styled";
import {
  LinkContainer,
  PublicLinkCopyButton,
  PublicLinkTextContainer,
  ExtensionOption,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel.styled";
import type { exportFormats } from "metabase/lib/urls";
import { Anchor, Box, Group, Stack, Text, Tooltip } from "metabase/ui";

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
      <LinkContainer noWrap p="sm" align="center">
        {loading ? (
          <PublicLinkTextContainer>
            <Text truncate c="text.0">{t`Loading…`}</Text>
          </PublicLinkTextContainer>
        ) : (
          <>
            <PublicLinkTextContainer>
              <Text truncate data-testid="public-link-text">
                {url}
              </Text>
            </PublicLinkTextContainer>
            <PublicLinkCopyButton value={url} />
          </>
        )}
      </LinkContainer>
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
      {onRemoveLink && (
        // The box is needed to center the tooltip on the anchor
        <Box>
          <Tooltip
            label={
              <Text fw={700} c="inherit">
                {removeTooltipLabel}
              </Text>
            }
          >
            <Anchor fz="sm" c="error.0" fw={700} onClick={onRemoveLink}>
              {removeButtonLabel}
            </Anchor>
          </Tooltip>
        </Box>
      )}
    </Stack>
  );
};
