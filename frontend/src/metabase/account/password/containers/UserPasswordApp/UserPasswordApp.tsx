import { connect } from "react-redux";

import { checkNotNull } from "metabase/core/utils/types";

import { getUser } from "metabase/selectors/user";

import type { State } from "metabase-types/store";

import { updatePassword, validatePassword } from "../../actions";
import UserPasswordForm from "../../components/UserPasswordForm";

const mapStateToProps = (state: State) => ({
  user: checkNotNull(getUser(state)),
  onValidatePassword: validatePassword,
  onSubmit: updatePassword,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(UserPasswordForm);
