import { t } from "ttag";

import { useListCardsQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getIcon } from "metabase/lib/icon";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { Group, Icon, Repeat, Skeleton, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList } from "./hooks";

type ModelUsageDetailsProps = {
  model: Question;
};

export function ModelUsageDetails({ model }: ModelUsageDetailsProps) {
  const {
    data: cards = [],
    error,
    isLoading,
  } = useListCardsQuery({
    f: "using_model",
    model_id: model.id(),
  });

  const { filtered, isExpanded, toggle } = useExpandableList(cards);

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
      <Text
        lh={1}
        color="text-secondary"
      >{t`This model is not used by any questions yet.`}</Text>
    );
  }

  return (
    <Stack gap="sm">
      {filtered.map((card) => {
        return (
          <Link
            to={Urls.question(card)}
            aria-label={card.name}
            variant="brand"
            key={card.id}
          >
            <Group gap="sm">
              <Icon
                c="text-primary"
                name={getIcon({ model: "card", ...card }).name as IconName}
              />
              <Text lh="1.25rem" color="inherit">
                {card.name}
              </Text>
            </Group>
          </Link>
        );
      })}
      <ToggleFullList
        isExpanded={isExpanded}
        toggle={toggle}
        sliceLength={filtered.length}
        fullLength={cards.length}
      />
    </Stack>
  );
}
