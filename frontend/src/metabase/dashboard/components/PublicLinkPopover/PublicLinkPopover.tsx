import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import CopyButton from "metabase/components/CopyButton";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type { exportFormats } from "metabase/lib/urls";
import { ExtensionOption } from "metabase/public/components/widgets/SharingPane.styled";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Anchor, Box, Button, Group, Popover, Text, Title } from "metabase/ui";

export type ExportFormatType = typeof exportFormats[number];

export const PublicLinkPopover = ({
  target,
  createPublicLink,
  deletePublicLink,
  uuid,
  getPublicLink,
  isOpen,
  onClose,
  extensions = [],
}: {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => void;
  deletePublicLink: () => void;
  uuid: string | null;
  getPublicLink: (exportFormat?: ExportFormatType) => string | null;
  extensions?: ExportFormatType[];
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const [exportFormat, setExportFormat] = useState<ExportFormatType | null>();

  const url = getPublicLink();

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
        <Box p="lg">
          <Title order={4}>{t`Public link`}</Title>
          <Text>{t`Anyone can view this if you give them the link.`}</Text>
          <Group
            noWrap
            w="28rem"
            pl="sm"
            pr="xs"
            style={{
              border: `1px solid ${color("border")}`,
              borderRadius: "0.25rem",
            }}
          >
            {loading ? (
              <Box style={{ flex: 1, overflow: "hidden" }}>
                <Text truncate>{t`Loading…`}</Text>
              </Box>
            ) : (
              <>
                <Box style={{ flex: 1, overflow: "hidden" }}>
                  <Text truncate>{url}</Text>
                </Box>
                <Button variant="unstyled" c="text.2">
                  <CopyButton value={url} />
                </Button>
              </>
            )}
          </Group>
          {extensions && extensions.length > 0 && (
            <Group>
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
