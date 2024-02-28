import { loginHistoryApi } from "metabase/api/login-history";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";

import LoginHistoryList from "../../components/LoginHistory";

export default function LoginHistoryApp() {
  const {
    data: loginHistory,
    error,
    isLoading,
  } = loginHistoryApi.useGetLoginHistoryQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <LoginHistoryList loginHistory={loginHistory} />;
}
