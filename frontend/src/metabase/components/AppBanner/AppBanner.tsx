import type { Location } from "history";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { DatabasePromptBanner } from "metabase/nav/components/DatabasePromptBanner";
import {
  PaymentBanner,
  shouldRenderPaymentBanner,
} from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { getUserIsAdmin } from "metabase/selectors/user";

interface AppBannerProps {
  location: Location;
}

export const AppBanner = ({ location }: AppBannerProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const tokenStatus = useSetting("token-status");
  if (tokenStatus && shouldRenderPaymentBanner({ isAdmin, tokenStatus })) {
    return <PaymentBanner isAdmin={isAdmin} tokenStatus={tokenStatus} />;
  }

  return <DatabasePromptBanner location={location} />;
};
