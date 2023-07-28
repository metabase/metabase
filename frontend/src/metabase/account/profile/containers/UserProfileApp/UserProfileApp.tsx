import { connect } from "react-redux";

import { checkNotNull } from "metabase/core/utils/types";

import { getUser } from "metabase/selectors/user";

import type { State } from "metabase-types/store";

import UserProfileForm from "../../components/UserProfileForm";
import { updateUser } from "../../actions";
import { getIsSsoUser, getLocales } from "../../selectors";

const mapStateToProps = (state: State) => ({
  user: checkNotNull(getUser(state)),
  locales: getLocales(state),
  isSsoUser: getIsSsoUser(state),
});

const mapDispatchToProps = {
  onSubmit: updateUser,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(UserProfileForm);
