import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { metabaseReduxContext } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";

type Props = { children: React.ReactElement };

const TransformsNotDisabledGuard = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "TransformsNotDisabled",
  redirectPath: Urls.dataStudioSettings(),
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    !getSetting(state, "transforms-setup-complete") ||
    getSetting(state, "transforms-enabled"),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

export const TransformsNotDisabled = TransformsNotDisabledGuard(
  ({ children }) => children,
);
