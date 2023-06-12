import type { Location } from "history";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  PaymentBanner,
  shouldRenderPaymentBanner,
} from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { DatabasePromptBanner } from "metabase/nav/components/DatabasePromptBanner";

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
  } else {
    return <DatabasePromptBanner location={location} />;
  }
};
