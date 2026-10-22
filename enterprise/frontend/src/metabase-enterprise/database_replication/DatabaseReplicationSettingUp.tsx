import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { Box, Flex, Loader, type ModalStepProps, Text } from "metabase/ui";

export const getDatabaseReplicationSettingUpModalProps =
  (): ModalStepProps => ({
    layout: "centered",
    title: t`Setting up, please wait`,
    illustration: (
      <Box h={96} pos="relative" w={96}>
        <MetabotLogo variant="cloud" alt={t`Metabot Cloud`} />
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
      </Box>
    ),
  });

export const DatabaseReplicationSettingUp = () => (
  <Text c="text-secondary">{t`This will take just a minute or so`}</Text>
);
