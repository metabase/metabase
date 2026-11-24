import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import {
  WAITING_REFRESH_INTERVAL,
  useTokenRefreshUntil,
} from "metabase/settings";
import {
  Box,
  Button,
  Flex,
  Loader,
  Modal,
  type ModalProps,
  Text,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { METABASE_MANAGED_AI_FEATURE } from "../../constants";

export function MetabotSettingUpModal({
  isSavingConfiguration = false,
  onClose,
  opened,
}: Pick<ModalProps, "opened" | "onClose"> & {
  isSavingConfiguration?: boolean;
}) {
  const isSettingUp =
    isSavingConfiguration || !hasPremiumFeature(METABASE_MANAGED_AI_FEATURE);

  useTokenRefreshUntil(METABASE_MANAGED_AI_FEATURE, {
    intervalMs: WAITING_REFRESH_INTERVAL,
    skip: !opened || !isSettingUp,
  });

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
      title={
        isSettingUp
          ? t`Setting up Metabot AI, please wait`
          : t`Metabot AI is ready`
      }
    >
      <Text c="text-secondary">
        {isSettingUp
          ? t`This will take just a minute or so`
          : t`Happy exploring!`}
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
}
