import { userApi } from "metabase/api";
import { connect } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { getUser } from "metabase/selectors/user";
import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import UserProfileForm from "../../components/UserProfileForm";
import { getIsSsoUser, getLocales } from "../../selectors";
import type { UserProfileData } from "../../types";

const mapStateToProps = (state: State) => ({
  user: checkNotNull(getUser(state)),
  locales: getLocales(state),
  isSsoUser: getIsSsoUser(state),
});

const mapDispatchToProps = {
  onSubmit: (user: User, data: UserProfileData) => async (dispatch: any) => {
    await dispatch(
      userApi.endpoints.updateUser.initiate({ ...data, id: user.id }),
    ).unwrap();

    if (user.locale !== data.locale) {
      window.location.reload();
    }
  },
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(UserProfileForm);
