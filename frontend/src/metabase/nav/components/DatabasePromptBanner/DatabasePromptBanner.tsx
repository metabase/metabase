import { t } from "ttag";
import type { Location } from "history";

import Link from "metabase/core/components/Link/Link";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getIsPaidPlan } from "metabase/selectors/settings";

import {
  ConnectDatabaseButton,
  CallToActions,
  DatabasePromptBannerRoot,
  Prompt,
  GetHelpButton,
} from "./DatabasePromptBanner.styled";

interface DatabasePromptBannerProps {
  location: Location;
}

export function DatabasePromptBanner({ location }: DatabasePromptBannerProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const { data: databases = [] } = useDatabaseListQuery({
    enabled: isAdmin && isPaidPlan,
  });
  const onlyHaveSampleDatabase =
    databases.length === 1 && databases[0].is_sample;
  const shouldShowDatabasePromptBanner =
    isAdmin && isPaidPlan && onlyHaveSampleDatabase;

  if (!shouldShowDatabasePromptBanner) {
    return null;
  }

  const isOnAdminAddDatabasePage = location.pathname.startsWith(
    "/admin/databases/create",
  );

  return (
    <DatabasePromptBannerRoot role="banner">
      <Prompt>{t`Connect to your database to get the most from Metabase.`}</Prompt>
      <CallToActions>
        <GetHelpButton href="https://metabase.com/help/connect">{t`Get help connecting`}</GetHelpButton>
        {!isOnAdminAddDatabasePage && (
          <Link to="/admin/databases/create">
            <ConnectDatabaseButton small>
              Connect your database
            </ConnectDatabaseButton>
          </Link>
        )}
      </CallToActions>
    </DatabasePromptBannerRoot>
  );
}
