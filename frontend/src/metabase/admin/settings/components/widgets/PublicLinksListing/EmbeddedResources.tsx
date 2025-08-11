import { t } from "ttag";

import {
  useListEmbeddableCardsQuery,
  useListEmbeddableDashboardsQuery,
} from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import type {
  GetEmbeddableCard,
  GetEmbeddableDashboard,
} from "metabase-types/api";

import { SettingHeader } from "../../SettingHeader";

import { PublicLinksListing } from "./PublicLinksListing";

// refetch if revisiting this page and the cache is over a minute old
const refetchSettings = { refetchOnMountOrArgChange: 60 };

const DashboardEmbeddedResources = () => {
  const query = useListEmbeddableDashboardsQuery(undefined, refetchSettings);

  return (
    <>
      <SettingHeader id="embedded-dashboards" title={t`Embedded Dashboards`} />
      <PublicLinksListing<GetEmbeddableDashboard>
        data-testid="-embedded-dashboards-setting"
        getUrl={(dashboard) => Urls.dashboard(dashboard)}
        noLinksMessage={t`No dashboards have been embedded yet.`}
        {...query}
      />
    </>
  );
};

export const QuestionEmbeddedResources = () => {
  const query = useListEmbeddableCardsQuery(undefined, refetchSettings);

  return (
    <>
      <SettingHeader id="embedded-questions" title={t`Embedded Questions`} />
      <PublicLinksListing<GetEmbeddableCard>
        data-testid="-embedded-questions-setting"
        getUrl={(question) => Urls.question(question)}
        noLinksMessage={t`No questions have been embedded yet.`}
        {...query}
      />
    </>
  );
};

export const EmbeddedResources = () => {
  return (
    <Stack gap="md" maw="50rem">
      <DashboardEmbeddedResources />
      <QuestionEmbeddedResources />
    </Stack>
  );
};
