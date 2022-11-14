import { connect } from "react-redux";
import { getUser } from "metabase/selectors/user";

import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import UserProfileForm from "../../components/UserProfileForm";
import { updateUser } from "../../actions";
import { getIsSsoUser, getLocales } from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: getUser(state) as User, // shouldn't be reachable for non-logged in users
  locales: getLocales(state),
  isSsoUser: getIsSsoUser(state),
});

const mapDispatchToProps = {
  onSubmit: updateUser,
};

export default connect(mapStateToProps, mapDispatchToProps)(UserProfileForm);
