import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  Button,
  Center,
  Group,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";

interface EmbeddingSdkLegaleseModalProps extends ModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

export const EmbeddingSdkLegaleseModal = ({
  onAccept,
  onDecline,
  opened,
}: EmbeddingSdkLegaleseModalProps) => (
  <Modal
    title="Enable Embedded analytics SDK"
    size="60vw"
    onClose={onDecline}
    opened={opened}
  >
    <Center h="40vh" p="xl">
      <Stack w="40rem" p="xl" align="center" spacing="xl">
        <Title fz="lg" order={2}>
          {t`First, some things we have to tell you:`}
        </Title>
        <Stack p="lg" className={cx(CS.rounded, CS.bordered)}>
          <Stack spacing={0}>
            <Text fw="bold">
              {t`Sharing Metabase accounts is a security risk.`}
            </Text>
            <Text>
              {t`Even if you filter data on the client side, each user could use
                their token to view any data visible to that shared user
                account.`}
            </Text>
          </Stack>
          <Stack spacing={0}>
            <Text fw="bold">
              {t`Sharing accounts is not permitted under our terms of service.`}
            </Text>
            <Text>{t`Fair usage of the SDK involves giving each end-user of the
                embedded analytics their own Metabase account`}</Text>
          </Stack>
        </Stack>
        <Group position="center">
          <Button onClick={onDecline}>{t`Decline and go back`}</Button>
          <Button
            variant="filled"
            onClick={onAccept}
          >{t`Accept and continue`}</Button>
        </Group>
      </Stack>
    </Center>
  </Modal>
);
