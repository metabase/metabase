import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { PaymentBanner } from "metabase/nav/components/PaymentBanner/PaymentBanner";
import { DatabasePromptBanner } from "metabase/nav/components/DatabasePromptBanner";

export const AppBanner = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const tokenStatusStatus = useSelector(
    state => getSetting(state, "token-status")?.status,
  );
  if (PaymentBanner.shouldRender({ isAdmin, tokenStatusStatus })) {
    return (
      <PaymentBanner isAdmin={isAdmin} tokenStatusStatus={tokenStatusStatus} />
    );
  } else {
    return <DatabasePromptBanner />;
  }
};
