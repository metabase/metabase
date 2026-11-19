import { t } from "ttag";

import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch } from "metabase/redux";
import { setPendingMetabotCard } from "metabase/redux/query-builder";
import { Anchor, Badge, Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useSavedChartCardId } from "../../hooks";

/**
 * A chart Metabot generated, as a link that opens it in the query builder.
 * Once the chart is saved, the link opens the saved question.
 */
export function MetabotInlineChartLink({ value }: { value: GeneratedCard }) {
  const dispatch = useDispatch();
  const savedCardId = useSavedChartCardId(value.id);
  const isSaved = savedCardId != null;
  const url = isSaved
    ? Urls.card({ id: savedCardId, name: value.title })
    : Urls.generatedCard(value);

  const handleClick = () => {
    if (!isSaved) {
      dispatch(setPendingMetabotCard({ url }));
    }
  };

  return (
    <Flex
      align="center"
      gap="sm"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      p="lg"
      data-testid="metabot-inline-chart-link"
    >
      <Icon name="insight" c="core-brand" />
      <Anchor
        component={ForwardRefLink}
        to={url}
        onClick={handleClick}
        fw="bold"
        truncate
        flex={1}
        miw={0}
      >
        {value.title}
      </Anchor>
      {isSaved && <Badge variant="light">{t`Saved`}</Badge>}
    </Flex>
  );
}
