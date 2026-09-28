import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type { PaneHeaderTitleSize } from "metabase/common/data-studio/components/PaneHeader";
import type {
  MetricPageParams,
  MetricPageProps,
} from "metabase/common/metrics/types";
import { useParams } from "metabase/router";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

import { MetricAbout } from "./MetricAbout";

interface MetricAboutPageProps extends MetricPageProps {
  showManagementPanels?: boolean;
  titleSize?: PaneHeaderTitleSize;
}

export function MetricAboutPage({
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
  isInlineEditable,
  showManagementPanels,
  titleSize = "h1",
}: MetricAboutPageProps) {
  const { cardId } = useParams<MetricPageParams>();

  return (
    <MetricPageCard cardId={cardId}>
      {(card, metadata) => (
        <PageContainer data-testid="metric-about-page" gap="xxl">
          <MetricPageShell
            card={card}
            urls={urls}
            renderBreadcrumbs={renderBreadcrumbs}
            showAppSwitcher={showAppSwitcher}
            showDataStudioLink={showDataStudioLink}
            titleSize={titleSize}
            isInlineEditable={isInlineEditable}
          />
          <MetricAbout
            card={card}
            metadata={metadata}
            urls={urls}
            showManagementPanels={showManagementPanels}
            isInlineEditable={isInlineEditable}
          />
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
