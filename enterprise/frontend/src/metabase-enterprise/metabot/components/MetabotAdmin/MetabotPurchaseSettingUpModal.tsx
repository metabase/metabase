import { t } from "ttag";

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

export const MetabotPurchaseSettingUpModal = ({
  onClose,
  opened,
}: Pick<ModalProps, "opened" | "onClose">) => (
  <Modal
    opened={opened}
    onClose={onClose}
    closeOnClickOutside={false}
    closeOnEscape={false}
    withCloseButton={false}
    size="30rem"
    padding="2.5rem"
    title={undefined}
    mah="80%"
  >
    <Stack align="center" gap="lg" my="4.5rem">
      <Box h={96} pos="relative" w={96}>
        <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />

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
            // eslint-disable-next-line no-color-literals
            boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 6px 0 rgba(0, 0, 0, 0.10)`,
          }}
        >
          <Loader size="xs" ml={1} mt={1} />
        </Flex>
      </Box>

      <Box ta="center">
        <Title c="text-primary" fz="lg">
          {t`Setting up Metabot AI, please wait`}
        </Title>
        <Text c="text-secondary" fz="md" lh={1.43}>
          {t`This will take just a minute or so.`}
        </Text>
        <Text c="text-secondary" fz="md" lh={1.43}>
          {t`Please reload this page to start exploring.`}
        </Text>
      </Box>

      <Button variant="filled" size="md" onClick={onClose}>
        {t`Done`}
      </Button>
    </Stack>
  </Modal>
);
