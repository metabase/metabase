import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type { MetricUrls } from "metabase/common/metrics/types";
import { useLocation } from "metabase/router";
import { Button, Icon } from "metabase/ui";
import type { Card } from "metabase-types/api";

interface MetricBackLinkProps {
  card: Card;
  urls: MetricUrls;
}

/**
 * The metric read view is one page now, but `/query`, `/dimensions`, `/history`, `/overview` and
 * `/dependencies` are still routed (Data Studio re-hosts them). Without this they would have no way
 * back.
 */
export function MetricBackLink({ card, urls }: MetricBackLinkProps) {
  const { pathname } = useLocation();
  const aboutUrl = urls.about(card.id);

  if (pathname === aboutUrl) {
    return null;
  }

  return (
    <Button
      component={Link}
      to={aboutUrl}
      variant="subtle"
      size="compact-sm"
      leftSection={<Icon name="chevronleft" />}
    >
      {t`Back to metric`}
    </Button>
  );
}
