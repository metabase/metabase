import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  PaymentBanner,
  shouldRenderPaymentBanner,
} from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { ReadOnlyBanner } from "metabase/nav/components/ReadOnlyBanner";
import { getUserIsAdmin } from "metabase/selectors/user";

export const AppBanner = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const tokenStatus = useSetting("token-status");
  const readOnly = useSetting("read-only-mode");

  if (tokenStatus && shouldRenderPaymentBanner({ isAdmin, tokenStatus })) {
    return <PaymentBanner isAdmin={isAdmin} tokenStatus={tokenStatus} />;
  }

  if (readOnly) {
    return <ReadOnlyBanner />;
  }
  return null;
};
