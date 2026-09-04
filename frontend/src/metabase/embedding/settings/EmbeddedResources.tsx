import { t } from "ttag";

import {
  useListEmbeddableCardsQuery,
  useListEmbeddableDashboardsQuery,
} from "metabase/api";
import { PublicLinksListing } from "metabase/common/components/PublicLinksListing/PublicLinksListing";
import { SettingHeader } from "metabase/settings-components/SettingHeader";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  GetEmbeddableCard,
  GetEmbeddableDashboard,
} from "metabase-types/api";

// refetch if revisiting this page and the cache is over a minute old
const refetchSettings = { refetchOnMountOrArgChange: 60 };

const DashboardEmbeddedResources = () => {
  const query = useListEmbeddableDashboardsQuery(undefined, refetchSettings);

  return (
    <Stack gap="xxs">
      <SettingHeader id="embedded-dashboards" title={t`Embedded dashboards`} />
      <PublicLinksListing<GetEmbeddableDashboard>
        data-testid="-embedded-dashboards-setting"
        getUrl={(dashboard) => Urls.dashboard(dashboard)}
        noLinksMessage={t`No dashboards have been embedded yet.`}
        {...query}
      />
    </Stack>
  );
};

export const QuestionEmbeddedResources = () => {
  const query = useListEmbeddableCardsQuery(undefined, refetchSettings);

  return (
    <Stack gap="xxs">
      <SettingHeader id="embedded-questions" title={t`Embedded questions`} />
      <PublicLinksListing<GetEmbeddableCard>
        data-testid="-embedded-questions-setting"
        getUrl={(question) => Urls.card(question)}
        noLinksMessage={t`No questions have been embedded yet.`}
        {...query}
      />
    </Stack>
  );
};

export const EmbeddedResources = () => {
  return (
    <Stack gap="xl" maw="50rem">
      <DashboardEmbeddedResources />
      <QuestionEmbeddedResources />
    </Stack>
  );
};
