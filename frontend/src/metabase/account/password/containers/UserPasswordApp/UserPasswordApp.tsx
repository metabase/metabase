import type { State } from "metabase/redux/store";
import { getUser } from "metabase/selectors/user";
import { connect } from "metabase/utils/redux";
import { checkNotNull } from "metabase/utils/types";

import { validatePassword } from "../../actions";
import { UserPasswordForm } from "../../components/UserPasswordForm";

const mapStateToProps = (state: State) => ({
  user: checkNotNull(getUser(state)),
  onValidatePassword: validatePassword,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(UserPasswordForm);
