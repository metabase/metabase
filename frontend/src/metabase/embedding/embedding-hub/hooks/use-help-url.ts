import { useSetting } from "metabase/common/hooks";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { useSelector } from "metabase/utils/redux";

export const useHelpUrl = () => {
  const isPaidPlan = useSelector(getIsPaidPlan);
  const { tag } = useSetting("version");

  const path = isPaidPlan ? "help-premium" : "help";

  return `https://www.metabase.com/${path}?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${tag}`;
};
