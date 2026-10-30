import { t } from "ttag";

import {
  WAITING_REFRESH_INTERVAL,
  useTokenRefreshUntil,
} from "metabase/settings";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Modal,
  type ModalProps,
  Text,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

interface TransformsSettingUpModalProps extends Pick<
  ModalProps,
  "opened" | "onClose"
> {
  isPython?: boolean;
}

export const TransformsSettingUpModal = ({
  onClose,
  opened,
  isPython = false,
}: TransformsSettingUpModalProps) => {
  const featureToCheck = isPython ? "transforms-python" : "transforms-basic";
  useTokenRefreshUntil(featureToCheck, {
    intervalMs: WAITING_REFRESH_INTERVAL,
    skip: !opened,
  });
  const isSettingUp = !hasPremiumFeature(featureToCheck);
  const settingUpTitle = isPython
    ? t`Setting up Python transforms, please wait`
    : t`Setting up transforms, please wait`;
  const readyTitle = isPython
    ? t`Python transforms are ready`
    : t`Transforms are ready`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      size="30rem"
      mah="80%"
      layout="centered"
      illustration={
        <Box h={96} pos="relative" w={96}>
          <Flex
            align="center"
            justify="center"
            h="100%"
            w="100%"
            bg="background_page-secondary"
            style={{ borderRadius: "50%" }}
          >
            <Icon name="table2" size={48} c="core-brand" />
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
              bg="core-white"
              fz={0}
              p="sm"
              ta="center"
              style={{
                borderRadius: "100%",
                boxShadow: `0 1px 6px 0 var(--mb-color-shadow-default)`,
              }}
            >
              <Loader size="xs" ml={1} mt={1} />
            </Flex>
          )}
        </Box>
      }
      title={isSettingUp ? settingUpTitle : readyTitle}
    >
      <Text c="text-secondary">
        {isSettingUp
          ? t`This will take just a minute or so`
          : t`Happy transforming!`}
      </Text>
      {!isSettingUp && (
        <Modal.Footer>
          <Button variant="filled" onClick={onClose}>
            {t`Done`}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};
