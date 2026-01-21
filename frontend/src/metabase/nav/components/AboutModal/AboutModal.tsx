import { t } from "ttag";
import _ from "underscore";

import LogoIcon from "metabase/common/components/LogoIcon";
import { useSetting } from "metabase/common/hooks";
import { capitalize } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import {
  getApplicationName,
  getIsWhiteLabeling,
} from "metabase/selectors/whitelabel";
import {
  Box,
  Divider,
  Flex,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { MetabaseInfo } from "metabase-types/api";

export const AboutModal = ({
  onClose,
  opened,
}: Pick<ModalProps, "onClose" | "opened">) => {
  const version = useSetting("version") as MetabaseInfo["version"];
  const applicationName = useSelector(getApplicationName);
  const { tag, date, ...versionExtra } = version;

  const isWhiteLabeling = useSelector(getIsWhiteLabeling);
  const showTrademark = !isWhiteLabeling;

  return (
    <Modal opened={opened} onClose={onClose} withCloseButton={false} size={475}>
      <Flex direction="column" align="center" pb="lg">
        <Box c="brand" pb="md">
          <LogoIcon height={48} />
        </Box>
        <Stack gap={14} align="center">
          <Title order={2}>{t`Thanks for using ${applicationName}!`}</Title>
          <Title order={4}>
            {t`You're on version`} {tag}
          </Title>
          <Text c="text-secondary" fw="bold">
            {t`Built on`} {date}
          </Text>
          {tag &&
            !/^v\d+\.\d+\.\d+$/.test(tag) &&
            _.map(versionExtra, (value, key) => (
              <Text key={key} c="text-secondary" fw="bold">
                {capitalize(key)}: {String(value)}
              </Text>
            ))}

          {showTrademark && (
            <>
              <Divider size={2} w="100%" />
              <Stack align="center" gap={0}>
                <Text fz="sm" fw="bold" c="text-secondary" lh="sm">
                  Metabase {t`is a Trademark of`} Metabase, Inc
                </Text>
                <Text
                  fz="sm"
                  fw="bold"
                  c="text-secondary"
                  lh="sm"
                >{t`and is built with care by a team from all across this pale blue dot.`}</Text>
              </Stack>
            </>
          )}
        </Stack>
      </Flex>
    </Modal>
  );
};
