import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CardId } from "metabase-types/api";

interface ExploreMetricButtonProps {
  cardId: CardId;
}

export function ExploreMetricButton({ cardId }: ExploreMetricButtonProps) {
  return (
    <Button
      component={ForwardRefLink}
      to={Urls.exploreMetric(cardId)}
      variant="default"
      size="xs"
      leftSection={<Icon name="click" />}
      data-testid="explore-link"
    >
      {t`Explore`}
    </Button>
  );
}
