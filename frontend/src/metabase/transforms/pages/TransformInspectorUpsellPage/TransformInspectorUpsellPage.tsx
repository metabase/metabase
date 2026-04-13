import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { DATA_STUDIO_UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { DottedBackground } from "metabase/data-studio/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/data-studio/upsells/components/LineDecorator";
import { UpsellCardContent } from "metabase/data-studio/upsells/components/UpsellCardContent";
import * as Urls from "metabase/lib/urls";
import { TransformHeader } from "metabase/transforms/components/TransformHeader";
import {
  INSPECTOR_UPSELL_CAMPAIGN,
  INSPECTOR_UPSELL_LOCATION,
} from "metabase/transforms/constants";
import { useTransformWithPolling } from "metabase/transforms/hooks/use-transform-with-polling";
import { Center, Stack } from "metabase/ui";

type TransformInspectorUpsellPageProps = {
  params: { transformId: string };
};

export function TransformInspectorUpsellPage({
  params,
}: TransformInspectorUpsellPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const { transform, isLoading, error } = useTransformWithPolling(transformId);

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign: INSPECTOR_UPSELL_CAMPAIGN,
    location: INSPECTOR_UPSELL_LOCATION,
  });

  if (isLoading || error || !transform) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <DottedBackground>
      <PageContainer>
        <TransformHeader transform={transform} />
        <Stack align="center" py="xl">
          <LineDecorator>
            <UpsellCardContent
              campaign={INSPECTOR_UPSELL_CAMPAIGN}
              location={INSPECTOR_UPSELL_LOCATION}
              title={t`See what's happening inside your transforms`}
              description={t`Get a diagnostic view of your transforms, so you can catch data quality issues before they cause problems downstream.`}
              upgradeOnClick={upgradeOnClick}
              upgradeUrl={upgradeUrl}
            />
          </LineDecorator>
        </Stack>
      </PageContainer>
    </DottedBackground>
  );
}
