import cx from "classnames";
import { t } from "ttag";

import {
  useListEmbeddableCardsQuery,
  useListEmbeddableDashboardsQuery,
} from "metabase/api";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { Stack, Text } from "metabase/ui";
import type {
  GetPublicOrEmbeddableCard,
  GetPublicOrEmbeddableDashboard,
} from "metabase-types/api";

import { PublicLinksListing } from "./PublicLinksListing";

const DashboardEmbeddedResources = () => {
  const query = useListEmbeddableDashboardsQuery();

  return (
    <div>
      <Text mb="sm">{t`Embedded Dashboards`}</Text>
      <div
        className={cx(CS.bordered, CS.rounded, CS.full)}
        style={{ maxWidth: 820 }}
      >
        <PublicLinksListing<GetPublicOrEmbeddableDashboard>
          data-testid="-embedded-dashboards-setting"
          getUrl={dashboard => Urls.dashboard(dashboard)}
          noLinksMessage={t`No dashboards have been embedded yet.`}
          {...query}
        />
      </div>
    </div>
  );
};

export const QuestionEmbeddedResources = () => {
  const query = useListEmbeddableCardsQuery();

  return (
    <div>
      <Text mb="sm">{t`Embedded Questions`}</Text>
      <div
        className={cx(CS.bordered, CS.rounded, CS.full)}
        style={{ maxWidth: 820 }}
      >
        <PublicLinksListing<GetPublicOrEmbeddableCard>
          data-testid="-embedded-questions-setting"
          getUrl={question => Urls.question(question)}
          noLinksMessage={t`No questions have been embedded yet.`}
          {...query}
        />
      </div>
    </div>
  );
};

export const EmbeddedResources = () => {
  return (
    <Stack spacing="md" className={CS.flexFull}>
      <DashboardEmbeddedResources />
      <QuestionEmbeddedResources />
    </Stack>
  );
};
