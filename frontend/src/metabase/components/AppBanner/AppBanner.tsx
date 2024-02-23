import type { Location } from "history";

import { useSelector } from "metabase/lib/redux";
import { DatabasePromptBanner } from "metabase/nav/components/DatabasePromptBanner";
import {
  PaymentBanner,
  shouldRenderPaymentBanner,
} from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

interface AppBannerProps {
  location: Location;
}

export const AppBanner = ({ location }: AppBannerProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const tokenStatusStatus = useSelector(
    state => getSetting(state, "token-status")?.status,
  );
  if (shouldRenderPaymentBanner({ isAdmin, tokenStatusStatus })) {
    return (
      <PaymentBanner isAdmin={isAdmin} tokenStatusStatus={tokenStatusStatus} />
    );
  }

  return <DatabasePromptBanner location={location} />;
};
