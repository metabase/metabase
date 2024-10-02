/* eslint-disable react/prop-types */
import { t } from "ttag";

import {
  useDeleteActionPublicLinkMutation,
  useDeleteCardPublicLinkMutation,
  useDeleteDashboardPublicLinkMutation,
  useListPublicActionsQuery,
  useListPublicCardsQuery,
  useListPublicDashboardsQuery,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import type {
  GetPublicOrEmbeddableCard,
  GetPublicOrEmbeddableDashboard,
} from "metabase-types/api";

import { PublicLinksListing } from "./PublicLinksListing";

export const PublicLinksDashboardListing = () => {
  const query = useListPublicDashboardsQuery();
  const [revoke] = useDeleteDashboardPublicLinkMutation();
  return (
    <PublicLinksListing<GetPublicOrEmbeddableDashboard>
      revoke={revoke}
      getUrl={dashboard => Urls.dashboard(dashboard)}
      getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
      noLinksMessage={t`No dashboards have been publicly shared yet.`}
      {...query}
    />
  );
};
export const PublicLinksQuestionListing = () => {
  const query = useListPublicCardsQuery();
  const [revoke] = useDeleteCardPublicLinkMutation();
  return (
    <PublicLinksListing<GetPublicOrEmbeddableCard>
      revoke={revoke}
      getUrl={question => Urls.question(question)}
      getPublicUrl={({ public_uuid }) =>
        Urls.publicQuestion({ uuid: public_uuid })
      }
      noLinksMessage={t`No questions have been publicly shared yet.`}
      {...query}
    />
  );
};

export const PublicLinksActionListing = () => {
  const siteUrl = useSetting("site-url");
  const query = useListPublicActionsQuery();
  const [revoke] = useDeleteActionPublicLinkMutation();

  return (
    <PublicLinksListing<{
      id: number;
      name: string;
      public_uuid: string | null;
      model_id: number;
    }>
      revoke={revoke}
      getUrl={action => Urls.action({ id: action.model_id }, action.id)}
      getPublicUrl={({ public_uuid }) =>
        Urls.publicAction(siteUrl, public_uuid)
      }
      noLinksMessage={t`No actions have been publicly shared yet.`}
      {...query}
    />
  );
};
