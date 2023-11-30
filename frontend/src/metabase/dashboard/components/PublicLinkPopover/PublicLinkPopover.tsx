import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import {
  PublicLinkCopyButton,
  PublicLinkTextContainer,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkPopover.styled";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type { exportFormats } from "metabase/lib/urls";
import { ExtensionOption } from "metabase/public/components/widgets/SharingPane.styled";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Anchor, Box, Group, Popover, Text, Title } from "metabase/ui";

export type ExportFormatType = typeof exportFormats[number] | null;

export type PublicLinkPopoverProps = {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => Promise<void>;
  deletePublicLink: () => Promise<void>;
  uuid: string | null;
  getPublicLink: ({
    exportFormat,
  }: {
    exportFormat: ExportFormatType;
  }) => string | null;
  extensions?: ExportFormatType[];
};

export const PublicLinkPopover = ({
  target,
  createPublicLink,
  deletePublicLink,
  uuid,
  getPublicLink,
  isOpen,
  onClose,
  extensions = [],
}: PublicLinkPopoverProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const [exportFormat, setExportFormat] = useState<ExportFormatType | null>(
    null,
  );

  const url = getPublicLink({ exportFormat });

  const { loading } = useAsync(async () => {
    if (isOpen && !uuid) {
      await createPublicLink();
    }
    return uuid;
  }, [uuid, isOpen]);

  const onRemoveLink = async () => {
    onClose();
    await deletePublicLink();
  };

  return (
    <Popover opened={isOpen} onClose={onClose} position="bottom-end">
      <Popover.Target>
        <div>{target}</div>
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="lg" data-testid="public-link-popover-content">
          <Title order={4}>{t`Public link`}</Title>
          <Text>{t`Anyone can view this if you give them the link.`}</Text>
          <Group
            noWrap
            w="28rem"
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
                  isSelected={extension === exportFormat}
                  onClick={() =>
                    setExportFormat(extensionState =>
                      extension === extensionState ? null : extension,
                    )
                  }
                >
                  {extension}
                </ExtensionOption>
              ))}
            </Group>
          )}
          {isAdmin && (
            <Box mt="md">
              <Anchor fz="sm" c="error.0" fw={700} onClick={onRemoveLink}>
                {t`Remove this public link`}
              </Anchor>
            </Box>
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
