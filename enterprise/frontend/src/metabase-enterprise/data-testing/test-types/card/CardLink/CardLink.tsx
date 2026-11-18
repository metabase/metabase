import { useGetCardQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Anchor, FixedSizeIcon, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CardTest } from "metabase-types/api";

type CardLinkProps = {
  test: CardTest;
};

export function CardLink({ test }: CardLinkProps) {
  const { data: card } = useGetCardQuery({ id: test.card_id });

  if (card == null) {
    return null;
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name="metric" c="core-brand" />
      <Anchor component={ForwardRefLink} to={Urls.dataStudioMetric(card.id)}>
        {card.name}
      </Anchor>
    </Group>
  );
}
