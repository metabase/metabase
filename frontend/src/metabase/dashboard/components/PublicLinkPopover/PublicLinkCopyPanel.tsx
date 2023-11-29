import { t } from "ttag";
import {
  PublicLinkCopyButton,
  PublicLinkTextContainer,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkPopover.styled";
import { color } from "metabase/lib/colors";
import type { exportFormats } from "metabase/lib/urls";
import { ExtensionOption } from "metabase/public/components/widgets/SharingPane/SharingPane.styled";
import { Anchor, Group, Stack, Text } from "metabase/ui";

export type ExportFormatType = typeof exportFormats[number] | null;

export const PublicLinkCopyPanel = ({
  loading = false,
  url,
  onRemoveLink,
  extensions = [],
  selectedExtension,
  onChangeExtension,
}: {
  loading?: boolean;
  url: string | null;
  onRemoveLink?: () => void;
  selectedExtension?: ExportFormatType;
  onChangeExtension?: (extension: ExportFormatType) => void;
  extensions?: ExportFormatType[];
}) => {
  return (
    <Stack>
      <Group
        noWrap
        p="sm"
        align="center"
        style={{
          border: `1px solid ${color("border")}`,
          borderRadius: "0.25rem",
        }}
      >
        {loading ? (
          <PublicLinkTextContainer>
            <Text truncate c="text.0">{t`Loading…`}</Text>
          </PublicLinkTextContainer>
        ) : (
          <>
            <PublicLinkTextContainer>
              <Text truncate>{url}</Text>
            </PublicLinkTextContainer>
            <PublicLinkCopyButton value={url} />
          </>
        )}
      </Group>
      {extensions && extensions.length > 0 && (
        <Group my="sm">
          {extensions.map(extension => (
            <ExtensionOption
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
        <Anchor fz="sm" c="error.0" fw={700} onClick={onRemoveLink}>
          {t`Remove this public link`}
        </Anchor>
      )}
    </Stack>
  );
};
