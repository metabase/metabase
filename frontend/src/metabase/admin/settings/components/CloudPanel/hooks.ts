import { useStoreUrl } from "metabase/common/hooks";
import type { Plan } from "metabase/common/utils/plan";

export const useGetStoreUrl = (plan: Plan) => {
  const checkoutUrl = useStoreUrl("checkout");
  const loginUrl = useStoreUrl("login");
  return plan === "pro-self-hosted" ? loginUrl : checkoutUrl;
};
