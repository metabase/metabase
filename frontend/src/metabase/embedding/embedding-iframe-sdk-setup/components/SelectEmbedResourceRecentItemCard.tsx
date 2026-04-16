import { P, match } from "ts-pattern";

import { Card, Group, Icon, type IconName, Stack, Text } from "metabase/ui";

import { STEPS_WITHOUT_RESOURCE_SELECTION } from "../constants";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
} from "../types";

import S from "./SelectEmbedResourceRecentItemCard.module.css";

export const SelectEmbedResourceRecentItemCard = ({
  recentItem,
  selectedItemId,
  experience,
  onSelect,
}: {
  recentItem: SdkIframeEmbedSetupRecentItem;
  experience: SdkIframeEmbedSetupExperience;

  selectedItemId?: string | number;

  onSelect(
    experience: SdkIframeEmbedSetupExperience,
    id: string | number,
  ): void;
}) => (
  <Card
    p="md"
    key={recentItem.id}
    onClick={() => onSelect(experience, recentItem.id)}
    className={S.ResourceCard}
    data-selected={selectedItemId === recentItem.id}
    data-testid="embed-recent-item-card"
  >
    <Group align="start" gap="sm">
      <Icon name={getCardIcon(experience)} size={20} c="brand" />

      <Stack gap="xs" flex={1}>
        <Text fw="bold">{recentItem.name}</Text>

        {recentItem.description && (
          <Text size="sm" c="text-secondary">
            {recentItem.description}
          </Text>
        )}
      </Stack>
    </Group>
  </Card>
);

const getCardIcon = (experience: SdkIframeEmbedSetupExperience): IconName =>
  match<SdkIframeEmbedSetupExperience, IconName>(experience)
    .with("chart", () => "bar")
    .with("dashboard", () => "dashboard")
    .with("browser", () => "collection")
    .with(P.union(...STEPS_WITHOUT_RESOURCE_SELECTION), () => "question") // these do not require resource selection
    .exhaustive();
