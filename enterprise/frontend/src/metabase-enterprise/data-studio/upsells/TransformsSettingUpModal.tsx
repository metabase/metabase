import { t } from "ttag";

import { useTokenRefreshUntil } from "metabase/api/utils";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

interface TransformsSettingUpModalProps
  extends Pick<ModalProps, "opened" | "onClose"> {
  isPython?: boolean;
}

export const TransformsSettingUpModal = ({
  onClose,
  opened,
  isPython = false,
}: TransformsSettingUpModalProps) => {
  const featureToCheck = isPython ? "transforms-python" : "transforms";
  useTokenRefreshUntil(featureToCheck, { intervalMs: 1000, skip: !opened });
  const isSettingUp = !hasPremiumFeature(featureToCheck);

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
          <Flex
            align="center"
            justify="center"
            h="100%"
            w="100%"
            bg="background-secondary"
            style={{ borderRadius: "50%" }}
          >
            <Icon name="table2" size={48} c="brand" />
          </Flex>

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
              {isPython
                ? t`Setting up Python transforms, please wait`
                : t`Setting up transforms, please wait`}
            </Title>
            <Text c="text-secondary" fz="md" lh={1.43}>
              {t`This will take just a minute or so`}
            </Text>
          </Box>
        ) : (
          <>
            <Box ta="center">
              <Title c="text-primary" fz="lg">
                {isPython
                  ? t`Python transforms are ready`
                  : t`Transforms are ready`}
              </Title>
              <Text c="text-secondary" fz="md" lh={1.43}>
                {t`Happy transforming!`}
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
