import cx from "classnames";
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
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import type {
  GetPublicAction,
  GetPublicCard,
  GetPublicDashboard,
} from "metabase-types/api";

import { PublicLinksListing } from "./PublicLinksListing";

export const PublicLinksDashboardListing = () => {
  const query = useListPublicDashboardsQuery();
  const [revoke] = useDeleteDashboardPublicLinkMutation();
  return (
    <div className={cx(CS.bordered, CS.rounded, CS.full)}>
      <PublicLinksListing<GetPublicDashboard>
        revoke={revoke}
        getUrl={dashboard => Urls.dashboard(dashboard)}
        getPublicUrl={({ public_uuid }: GetPublicDashboard) => {
          if (public_uuid) {
            return Urls.publicDashboard(public_uuid);
          }
          return null;
        }}
        noLinksMessage={t`No dashboards have been publicly shared yet.`}
        {...query}
      />
    </div>
  );
};

export const PublicLinksQuestionListing = () => {
  const query = useListPublicCardsQuery();
  const [revoke] = useDeleteCardPublicLinkMutation();
  return (
    <div className={cx(CS.bordered, CS.rounded, CS.full)}>
      <PublicLinksListing<GetPublicCard>
        revoke={revoke}
        getUrl={question => Urls.question(question)}
        getPublicUrl={({ public_uuid }) => {
          if (public_uuid) {
            return Urls.publicQuestion({ uuid: public_uuid });
          }
          return null;
        }}
        noLinksMessage={t`No questions have been publicly shared yet.`}
        {...query}
      />
    </div>
  );
};

export const PublicLinksActionListing = () => {
  const siteUrl = useSetting("site-url");
  const query = useListPublicActionsQuery();
  const [revoke] = useDeleteActionPublicLinkMutation();

  return (
    <div className={cx(CS.bordered, CS.rounded, CS.full)}>
      <PublicLinksListing<GetPublicAction>
        revoke={revoke}
        getUrl={action => Urls.action({ id: action.model_id }, action.id)}
        getPublicUrl={({ public_uuid }) => {
          if (public_uuid) {
            return Urls.publicAction(siteUrl, public_uuid);
          }
          return null;
        }}
        noLinksMessage={t`No actions have been publicly shared yet.`}
        {...query}
      />
    </div>
  );
};
