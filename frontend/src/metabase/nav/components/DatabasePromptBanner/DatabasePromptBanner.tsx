import type { Location } from "history";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link/Link";
import { trackDatabasePromptBannerClicked } from "metabase/nav/analytics";
import { useShouldShowDatabasePromptBanner } from "metabase/nav/hooks";

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
  const adminEmail = useSetting("admin-email");
  const siteUrl = useSetting("site-url");

  const helpUrl = new URL("https://metabase.com/help/connect");
  helpUrl.searchParams.set("email", adminEmail || "");
  helpUrl.searchParams.set("site_url", siteUrl || "");

  const shouldShowDatabasePromptBanner = useShouldShowDatabasePromptBanner();
  if (!shouldShowDatabasePromptBanner) {
    return null;
  }

  const isOnAdminAddDatabasePage = location.pathname.startsWith(
    "/admin/databases/create",
  );

  return (
    <DatabasePromptBannerRoot role="banner">
      {/* eslint-disable-next-line no-literal-metabase-strings -- Only shows for admins*/}
      <Prompt>{t`Connect to your database to get the most from Metabase.`}</Prompt>
      <CallToActions>
        <GetHelpButton
          href={helpUrl.href}
          onClickCapture={() => {
            trackDatabasePromptBannerClicked("help");
          }}
        >{t`Get help connecting`}</GetHelpButton>
        {!isOnAdminAddDatabasePage && (
          <Link
            to="/admin/databases/create"
            onClick={() => {
              trackDatabasePromptBannerClicked("nav");
            }}
          >
            <ConnectDatabaseButton small>
              {t`Connect your database`}
            </ConnectDatabaseButton>
          </Link>
        )}
      </CallToActions>
    </DatabasePromptBannerRoot>
  );
}
