import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import {
  Popover,
  Title,
  Text,
  TextInput,
  Box,
  Anchor,
  Button,
  Group,
} from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

export const PublicLinkPopover = ({
  resource_uuid,
  target,
  isOpen,
  onClose,
}: {
  resource_uuid: string | null;
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  // TODO: if there's no link, create it here.
  const url = resource_uuid
    ? Urls.publicQuestion({ uuid: resource_uuid })
    : "No link found";

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
            w="28rem"
            pl="sm"
            pr="xs"
            style={{
              border: `1px solid ${color("border")}`,
              borderRadius: "0.25rem",
            }}
          >
            <Box style={{ flex: 1 }}>
              <Text truncate>{url}</Text>
            </Box>
            <Button variant="unstyled" c="text.2">
              <Icon name="copy" />
            </Button>
          </Group>
          {isAdmin && (
            <Box mt="md">
              <Anchor fz="sm" c="error.0" fw={700}>
                {t`Remove this public link`}
              </Anchor>
            </Box>
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
