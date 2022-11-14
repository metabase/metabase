import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";

import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { updatePassword, validatePassword } from "../../actions";
import UserPasswordForm from "../../components/UserPasswordForm";

const mapStateToProps = (state: State) => ({
  user: getUser(state) as User, // page shouldn't be reachable for non-logged in users
  onValidatePassword: validatePassword,
  onSubmit: updatePassword,
});

export default connect(mapStateToProps)(UserPasswordForm);
