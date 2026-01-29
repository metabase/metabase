import { t } from "ttag";

import { useGetSettingsQuery } from "metabase/api";
import { useTokenRefreshUntil } from "metabase/api/utils";
import { Button, Flex, Icon, Loader, Stack, Text, Title } from "metabase/ui";

import type { UpgradeFlow } from "./constants";

interface UpgradeModalLoadingProps {
  flow: UpgradeFlow;
  onDone: () => void;
}

export function UpgradeModalLoading({
  flow,
  onDone,
}: UpgradeModalLoadingProps) {
  // Poll every second until no-upsell feature appears
  useTokenRefreshUntil("no-upsell", { intervalMs: 1000 });

  const { data: settings } = useGetSettingsQuery();
  const tokenFeatures = settings?.["token-status"]?.features ?? [];
  const isSettingUp = !tokenFeatures.includes("no-upsell");

  const isTrial = flow === "trial";

  if (isSettingUp) {
    const title = isTrial
      ? t`Setting up your free trial, please wait`
      : t`Setting up Metabase Pro, please wait`;

    return (
      <Stack align="center" gap="lg" py="xl">
        <Loader size="xl" />

        <Stack align="center" gap="xs">
          <Title order={3} ta="center">
            {title}
          </Title>
          <Text c="text-secondary" ta="center">
            {t`This will take just a minute or so`}
          </Text>
        </Stack>

        <Flex justify="center" w="100%">
          <Button variant="filled" color="brand" disabled>
            {t`Done`}
          </Button>
        </Flex>
      </Stack>
    );
  }

  // Success state - feature has arrived
  const successTitle = isTrial
    ? t`Your free trial is ready`
    : t`Metabase Pro is ready to use`;

  return (
    <Stack align="center" gap="lg" py="xl">
      <Flex
        align="center"
        justify="center"
        w={64}
        h={64}
        bg="success"
        style={{ borderRadius: "50%" }}
      >
        <Icon name="check" c="white" size={32} />
      </Flex>

      <Stack align="center" gap="xs">
        <Title order={3} ta="center">
          {successTitle}
        </Title>
        <Text c="text-secondary" ta="center">
          {t`Happy exploring!`}
        </Text>
      </Stack>

      <Flex justify="center" w="100%">
        <Button
          variant="filled"
          color="brand"
          onClick={() => {
            onDone();
            window.location.reload();
          }}
        >
          {t`Done`}
        </Button>
      </Flex>
    </Stack>
  );
}
