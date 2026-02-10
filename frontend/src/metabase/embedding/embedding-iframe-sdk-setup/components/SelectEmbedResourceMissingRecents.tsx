import { match } from "ts-pattern";
import { c, t } from "ttag";

import { Anchor, Icon, type IconName, Stack, Text } from "metabase/ui";

import type { SdkIframeEmbedSetupExperience } from "../types";

export const SelectEmbedResourceMissingRecents = ({
  experience,
  openPicker,
}: {
  experience: SdkIframeEmbedSetupExperience;
  openPicker: () => void;
}) => {
  const embedIcon = match<SdkIframeEmbedSetupExperience, IconName>(experience)
    .with("dashboard", () => "dashboard")
    .with("browser", () => "collection")
    .otherwise(() => "bar");

  return (
    <Stack
      align="center"
      gap="md"
      py="xl"
      data-testid="embed-resource-missing-recents"
    >
      <Icon name={embedIcon} size={48} c="text-tertiary" />

      <Stack align="center" gap="xs">
        <Text fw="bold" size="md">
          {getEmptyStateTitle(experience)}
        </Text>

        <Text size="sm" c="text-secondary" ta="center">
          {getEmptyStateDescription(experience)}
        </Text>

        <Text size="sm" c="text-secondary" ta="center">
          {getSearchLink(experience, openPicker)}
        </Text>
      </Stack>
    </Stack>
  );
};

const getEmptyStateTitle = (experience: SdkIframeEmbedSetupExperience) =>
  match(experience)
    .with("dashboard", () => t`No recent dashboards`)
    .with("chart", () => t`No recent charts`)
    .with("browser", () => t`No recent collections`)
    .otherwise(() => null);

const getEmptyStateDescription = (experience: SdkIframeEmbedSetupExperience) =>
  match(experience)
    .with("dashboard", () => t`You haven't visited any dashboards recently.`)
    .with("chart", () => t`You haven't visited any charts recently.`)
    .with("browser", () => t`You haven't visited any collections recently.`)
    .otherwise(() => null);

const getSearchLink = (
  experience: SdkIframeEmbedSetupExperience,
  openPicker: () => void,
) =>
  match(experience)
    .with(
      "dashboard",
      () =>
        c("{0} is a link button to search for dashboards")
          .jt`You can ${(<Anchor size="sm" onClick={openPicker} key="picker-link" inline>{t`search for dashboards`}</Anchor>)} to embed.`,
    )
    .with(
      "chart",
      () =>
        c("{0} is a link button to search for charts")
          .jt`You can ${(<Anchor size="sm" onClick={openPicker} key="picker-link" inline>{t`search for charts`}</Anchor>)} to embed.`,
    )
    .otherwise(() => null);
