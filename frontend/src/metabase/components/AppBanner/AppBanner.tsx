import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  PaymentBanner,
  shouldRenderPaymentBanner,
} from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { getUserIsAdmin } from "metabase/selectors/user";

export const AppBanner = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const tokenStatus = useSetting("token-status");
  if (tokenStatus && shouldRenderPaymentBanner({ isAdmin, tokenStatus })) {
    return <PaymentBanner isAdmin={isAdmin} tokenStatus={tokenStatus} />;
  }
  return null;
};
