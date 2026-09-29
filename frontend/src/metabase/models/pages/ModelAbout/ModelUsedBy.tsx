import { t } from "ttag";

import { useListCardsQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Group, Icon, Repeat, Skeleton, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CardId } from "metabase-types/api";

export type ModelUsedByProps = {
  modelId: CardId;
};

/**
 * Fallback for the "Used by" panel when the dependency graph is unavailable: the questions built
 * on this model, straight off the card list endpoint.
 */
export function ModelUsedBy({ modelId }: ModelUsedByProps) {
  const getIcon = useGetIcon();
  const {
    data: cards = [],
    error,
    isLoading,
  } = useListCardsQuery({ f: "using_model", model_id: modelId });

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoading) {
    return (
      <Repeat times={2}>
        <Skeleton h="1rem" natural />
      </Repeat>
    );
  }

  if (cards.length === 0) {
    return (
      <Text c="text-secondary">{t`This model is not used by any questions yet.`}</Text>
    );
  }

  return (
    <Stack gap="sm">
      {cards.map((card) => (
        <Link
          key={card.id}
          to={Urls.card(card)}
          aria-label={card.name}
          variant="brand"
        >
          <Group gap="sm">
            <Icon
              c="text-primary"
              name={getIcon({ model: "card", ...card }).name}
            />
            <Text lh="1.25rem" c="inherit">
              {card.name}
            </Text>
          </Group>
        </Link>
      ))}
    </Stack>
  );
}
