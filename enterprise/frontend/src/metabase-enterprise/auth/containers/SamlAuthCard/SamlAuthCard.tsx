import { connect } from "react-redux";
import { t } from "ttag";

import AuthCard from "metabase/admin/settings/auth/components/AuthCard";
import { updateSettings } from "metabase/admin/settings/settings";
import { getSetting } from "metabase/selectors/settings";
import type { Dispatch, State } from "metabase-types/store";

import { SAML_SCHEMA } from "../../constants";

const mapStateToProps = (state: State) => ({
  type: "saml",
  name: t`SAML`,
  description: t`Allows users to login via a SAML Identity Provider.`,
  isConfigured: Boolean(getSetting(state, "saml-configured")),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onDeactivate: () => dispatch(updateSettings(SAML_SCHEMA.getDefault())),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(AuthCard);
