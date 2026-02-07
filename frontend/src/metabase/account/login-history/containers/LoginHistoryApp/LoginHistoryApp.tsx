import { useGetLoginHistoryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";

import LoginHistoryList from "../../components/LoginHistory";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function LoginHistoryApp() {
  const { data: loginHistory, error, isLoading } = useGetLoginHistoryQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <LoginHistoryList loginHistory={loginHistory ?? []} />;
}
