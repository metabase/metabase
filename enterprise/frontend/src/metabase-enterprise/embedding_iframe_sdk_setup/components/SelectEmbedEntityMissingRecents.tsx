import { match } from "ts-pattern";
import { c, t } from "ttag";

import { Anchor, Icon, Stack, Text } from "metabase/ui";

import type { SdkIframeEmbedSetupExperience } from "../types";

export const SelectEmbedEntityMissingRecents = ({
  experience,
  openPicker,
}: {
  experience: SdkIframeEmbedSetupExperience;
  openPicker: () => void;
}) => {
  const embedIcon = experience === "dashboard" ? "dashboard" : "bar";

  const emptyStateDescription = match(experience)
    .with(
      "dashboard",
      () =>
        c("{0} is a link button to search for dashboards")
          .jt`You haven't visited any dashboards recently. ${(<br />)} You can ${(<Anchor size="sm" onClick={openPicker} inline>{t`search for dashboards`}</Anchor>)} to embed.`,
    )
    .with(
      "chart",
      () =>
        c("{0} is a link button to search for charts")
          .jt`You haven't visited any charts recently. ${(<br />)} You can ${(<Anchor size="sm" onClick={openPicker} inline>{t`search for charts`}</Anchor>)} to embed.`,
    )
    .otherwise(() => null);

  return (
    <Stack
      align="center"
      gap="md"
      py="xl"
      data-testid="embed-entity-missing-recents"
    >
      <Icon name={embedIcon} size={48} c="text-light" />

      <Stack align="center" gap="xs">
        <Text fw="bold" size="md">
          {getEmptyStateTitle(experience)}
        </Text>

        <Text size="sm" c="text-medium" ta="center" lh="lg">
          {emptyStateDescription}
        </Text>
      </Stack>
    </Stack>
  );
};

const getEmptyStateTitle = (experience: string) =>
  match(experience)
    .with("dashboard", () => t`No recent dashboards`)
    .with("chart", () => t`No recent charts`)
    .otherwise(() => null);
