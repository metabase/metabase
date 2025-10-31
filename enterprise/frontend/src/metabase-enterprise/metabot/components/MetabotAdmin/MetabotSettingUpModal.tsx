import { t } from "ttag";

import { useTokenRefreshUntil } from "metabase/api/utils";
import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import {
  Box,
  Button,
  Flex,
  Loader,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export const MetabotSettingUpModal = ({
  onClose,
  opened,
}: Pick<ModalProps, "opened" | "onClose">) => {
  useTokenRefreshUntil("metabot-v3", { intervalMs: 1000, skip: !opened });
  const isSettingUp = !hasPremiumFeature("metabot_v3");

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      size="30rem"
      padding="2.5rem"
      mah="80%"
    >
      <Stack align="center" gap="lg" my="4.5rem">
        <Box h={96} pos="relative" w={96}>
          <MetabotLogo variant="cloud" alt={t`Metabot Cloud`} />

          {isSettingUp && (
            <Flex
              bottom={0}
              align="center"
              direction="row"
              gap={0}
              justify="center"
              pos="absolute"
              right={0}
              wrap="nowrap"
              bg="white"
              fz={0}
              p="sm"
              ta="center"
              style={{
                borderRadius: "100%",
                boxShadow: `0 1px 6px 0 var(--mb-color-shadow)`,
              }}
            >
              <Loader size="xs" ml={1} mt={1} />
            </Flex>
          )}
        </Box>

        {isSettingUp ? (
          <Box ta="center">
            <Title c="text-primary" fz="lg">
              {t`Setting up Metabot AI, please wait`}
            </Title>
            <Text c="text-secondary" fz="md" lh={1.43}>
              {t`This will take just a minute or so`}
            </Text>
          </Box>
        ) : (
          <>
            <Box ta="center">
              <Title c="text-primary" fz="lg">
                {t`Metabot AI is ready`}
              </Title>
              <Text c="text-secondary" fz="md" lh={1.43}>
                {t`Happy exploring!`}
              </Text>
            </Box>

            <Button variant="filled" size="md" onClick={onClose}>
              {t`Done`}
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
};
