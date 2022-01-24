import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";
import { updatePassword, validatePassword } from "../../actions";
import UserPasswordForm from "../../components/UserPasswordForm";

const mapStateToProps = state => ({
  user: getUser(state),
});

const mapDispatchToProps = {
  validatePassword,
  updatePassword,
};

export default connect(mapStateToProps, mapDispatchToProps)(UserPasswordForm);
