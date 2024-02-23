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
  const tokenStatus = useSelector(state => getSetting(state, "token-status"));
  if (tokenStatus && shouldRenderPaymentBanner({ isAdmin, tokenStatus })) {
    return <PaymentBanner isAdmin={isAdmin} tokenStatus={tokenStatus} />;
  }

  return <DatabasePromptBanner location={location} />;
};
