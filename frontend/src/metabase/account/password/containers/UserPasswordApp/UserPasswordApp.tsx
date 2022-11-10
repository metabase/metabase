import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import { updatePassword, validatePassword } from "../../actions";
import UserPasswordForm from "../../components/UserPasswordForm";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  onValidatePassword: validatePassword,
  onSubmit: updatePassword,
});

export default connect(mapStateToProps)(UserPasswordForm);
