import { useDisclosure } from "@mantine/hooks";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { dayjs } from "metabase/dayjs";
import { useListSdkReact18HostsQuery } from "metabase/settings";
import {
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";

export function SdkReact18Alert() {
  const { data: hosts = [] } = useListSdkReact18HostsQuery();
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const { url: docsUrl } = useDocsUrl("embedding/sdk/introduction", {
    anchor: "modular-embedding-sdk-prerequisites",
  });

  if (hosts.length === 0) {
    return null;
  }

  const docsLink = (
    <ExternalLink key="docs" href={docsUrl}>
      {t`Learn more`}
    </ExternalLink>
  );

  return (
    <>
      <Alert
        icon={<Icon name="warning" />}
        color="warning"
        title={t`React 18 detected`}
        mb="xl"
      >
        <Stack gap="md" align="flex-start">
          <Box>
            {jt`Metabase 66 removes support for React 18, so please update these apps to React 19 before upgrading. ${docsLink}.`}
          </Box>
          <Button size="sm" onClick={openModal}>
            {t`See host apps`}
          </Button>
        </Stack>
      </Alert>
      <Modal
        opened={isModalOpen}
        onClose={closeModal}
        title={t`Host apps using React 18`}
      >
        <Stack gap="md">
          <Text>{t`These host apps used the embedding SDK with React 18 in the last 4 days. Update them to React 19 before upgrading to Metabase 66.`}</Text>
          <Stack gap="sm" component="ul" m={0} p={0}>
            {hosts.map(({ hostname, last_seen }) => (
              <Group key={hostname ?? ""} component="li" gap="sm" wrap="nowrap">
                <Icon name="globe" c="text-secondary" aria-hidden />
                <Box>
                  <Text fw="bold">{hostname ?? t`Unknown host app`}</Text>
                  <Text size="sm" c="text-secondary">
                    {t`Last seen ${dayjs(last_seen).format("ll")}`}
                  </Text>
                </Box>
              </Group>
            ))}
          </Stack>
        </Stack>
      </Modal>
    </>
  );
}
