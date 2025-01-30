import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { useMergeSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Button, Center, Group, Modal, Stack, Text, Title } from "metabase/ui";

import {
  SwitchWithSetByEnvVar,
  type SwitchWithSetByEnvVarProps,
} from "../widgets/EmbeddingOption/SwitchWithSetByEnvVar";

export const EmbeddingSdkEnvVarSwitch = ({
  onChange,
  ...switchProps
}: Pick<SwitchWithSetByEnvVarProps, "label" | "onChange">) => {
  const setting = useMergeSetting({ key: "enable-embedding-sdk" });
  const [opened, { open, close }] = useDisclosure();

  const onAccept = () => {
    onChange(true);
    close();
  };
  const showTerms = !setting.value;

  return (
    <>
      <SwitchWithSetByEnvVar
        settingKey="enable-embedding-sdk"
        onChange={showTerms ? open : onChange}
        {...switchProps}
      />

      <Modal
        opened={opened}
        onClose={close}
        title="Enable Embedded analytics SDK"
        size="60vw"
      >
        <Center h="40vh" p="xl">
          <Stack w="40rem" p="xl" align="center" spacing="xl">
            <Title fz="lg" order={2}>
              First, some things we have to tell you:
            </Title>
            <Stack p="lg" className={cx(CS.rounded, CS.bordered)}>
              <Stack spacing={0}>
                <Text fw="bold">
                  Sharing Metabase accounts is a security risk.
                </Text>
                <Text>
                  Even if you filter data on the client side, each user could
                  use their token to view any data visible to that shared user
                  account.
                </Text>
              </Stack>
              <Stack spacing={0}>
                <Text fw="bold">
                  Sharing accounts is not permitted under our terms of service.
                </Text>
                <Text>
                  Fair usage of the SDK involves giving each end-user of the
                  embedded analytics their own Metabase account
                </Text>
              </Stack>
            </Stack>
            <Group position="center">
              <Button
                variant="filled"
                onClick={onAccept}
              >{t`Accept and continue`}</Button>
            </Group>
          </Stack>
        </Center>
      </Modal>
    </>
  );
};
