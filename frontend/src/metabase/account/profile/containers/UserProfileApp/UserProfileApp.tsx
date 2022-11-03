import { connect } from "react-redux";
import Users from "metabase/entities/users";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import UserProfileForm from "../../components/UserProfileForm";
import { getIsSsoUser, getLocales } from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: getUser(state),
  locales: getLocales(state),
  isSsoUser: getIsSsoUser(state),
});

const mapDispatchToProps = {
  onSubmit: Users.actions.update,
};

export default connect(mapStateToProps, mapDispatchToProps)(UserProfileForm);
