import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PaymentBanner } from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { ReadOnlyBanner } from "metabase/nav/components/ReadOnlyBanner";
import { getUserIsAdmin } from "metabase/selectors/user";

export const AppBanner = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const tokenStatus = useSetting("token-status");
  const readOnly = useSetting("read-only-mode");

  const paymentStatuses = ["past-due", "unpaid", "invalid"];
  const shouldRenderPaymentBanner =
    tokenStatus && paymentStatuses.includes(tokenStatus?.status ?? "");

  if (!isAdmin) {
    return null;
  }

  if (readOnly) {
    return <ReadOnlyBanner />;
  }

  if (shouldRenderPaymentBanner) {
    return <PaymentBanner tokenStatus={tokenStatus} />;
  }

  return null;
};
