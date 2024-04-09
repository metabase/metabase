import { connect } from "react-redux";
import { t } from "ttag";

import AuthCard from "metabase/admin/settings/auth/components/AuthCard";
import { updateSettings } from "metabase/admin/settings/settings";
import { getSetting } from "metabase/selectors/settings";
import type { Dispatch, State } from "metabase-types/store";

import { JWT_SCHEMA } from "../../constants";

const mapStateToProps = (state: State) => ({
  type: "jwt",
  name: t`JWT`,
  description: t`Allows users to login via a JWT Identity Provider.`,
  isConfigured: Boolean(getSetting(state, "jwt-configured")),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(updateSettings(JWT_SCHEMA.getDefault())),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
