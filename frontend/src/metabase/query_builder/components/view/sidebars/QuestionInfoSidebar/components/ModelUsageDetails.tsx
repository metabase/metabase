import { t } from "ttag";

import { useListCardsQuery } from "metabase/api";
import { DetailsTable } from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Flex, Group, Icon, Repeat, Skeleton, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList } from "./hooks";

type ModelUsageDetailsProps = {
  model: Question;
};

export function ModelUsageDetails({ model }: ModelUsageDetailsProps) {
  const getIcon = useGetIcon();
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
      <DetailsTable>
        <Repeat times={2}>
          <Flex px="lg" py="sm">
            <Skeleton h="1rem" natural />
          </Flex>
        </Repeat>
      </DetailsTable>
    );
  }

  if (cards.length === 0) {
    return (
      <DetailsTable>
        <Text px="lg" py="sm" c="text-secondary">
          {t`This model is not used by any questions yet.`}
        </Text>
      </DetailsTable>
    );
  }

  return (
    <DetailsTable>
      {filtered.map((card) => (
        <Flex key={card.id} px="lg" py="sm">
          <Link to={Urls.card(card)} aria-label={card.name} variant="brand">
            <Group gap="sm" wrap="nowrap">
              <Icon
                c="text-primary"
                name={getIcon({ model: "card", ...card }).name}
              />
              <Text lh="1.25rem" color="inherit">
                {card.name}
              </Text>
            </Group>
          </Link>
        </Flex>
      ))}
      <ToggleFullList
        isExpanded={isExpanded}
        toggle={toggle}
        sliceLength={filtered.length}
        fullLength={cards.length}
      />
    </DetailsTable>
  );
}
