import { useAsync } from "react-use";
import { t } from "ttag";
import {
  LinkContainer,
  PublicLinkCopyButton,
  PublicLinkTextContainer,
} from "metabase/dashboard/components/PublicLinkPopover/PublicLinkPopover.styled";
import { useSelector } from "metabase/lib/redux";
import type { exportFormats } from "metabase/lib/urls";
import { ExtensionOption } from "metabase/public/components/widgets/SharingPane.styled";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Anchor, Box, Group, Popover, Text, Title, Tooltip } from "metabase/ui";

export type ExportFormatType = typeof exportFormats[number] | null;

export type PublicLinkPopoverProps = {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => Promise<void>;
  deletePublicLink: () => void;
  url: string | null;
  extensions?: ExportFormatType[];
  selectedExtension?: ExportFormatType | null;
  setSelectedExtension?: (extension: ExportFormatType) => void;
};

export const PublicLinkPopover = ({
  target,
  createPublicLink,
  deletePublicLink,
  url,
  isOpen,
  onClose,
  extensions = [],
  selectedExtension,
  setSelectedExtension,
}: PublicLinkPopoverProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const { loading } = useAsync(async () => {
    if (isOpen && !url) {
      return createPublicLink();
    }

    return null;
  }, [url, isOpen]);

  const onRemoveLink = () => {
    onClose();
    deletePublicLink();
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
          <LinkContainer noWrap w="28rem" p="sm" align="center">
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
                    setSelectedExtension?.(
                      extension === selectedExtension ? null : extension,
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
              <Tooltip
                label={
                  <Text
                    fw={700}
                    fz="md"
                    color="white"
                  >{t`Affects both public link and embed URL for this dashboard`}</Text>
                }
              >
                <Anchor fz="sm" c="error.0" fw={700} onClick={onRemoveLink}>
                  {t`Remove this public link`}
                </Anchor>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
