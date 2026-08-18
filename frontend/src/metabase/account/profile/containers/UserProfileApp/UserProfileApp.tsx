import { getIsSsoUser } from "metabase/account/selectors";
import { getUser } from "metabase/current-user";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";

import { updateUser } from "../../actions";
import UserProfileForm from "../../components/UserProfileForm";
import { getLocales } from "../../selectors";

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
