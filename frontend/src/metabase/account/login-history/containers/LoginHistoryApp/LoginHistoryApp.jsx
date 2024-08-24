import { useGetLoginHistoryQuery } from "metabase/api";
import { Loading } from "metabase/public/containers/PublicAction/PublicAction.styled";

import LoginHistoryList from "../../components/LoginHistory";

export default function LoginHistoryApp() {
  const { data: loginHistory, error, isLoading } = useGetLoginHistoryQuery();

  if (isLoading || error) {
    return <Loading loading={isLoading} error={error} />;
  }

  return <LoginHistoryList loginHistory={loginHistory} />;
}
