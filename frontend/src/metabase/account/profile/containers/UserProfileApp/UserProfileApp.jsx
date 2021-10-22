import { connect } from "react-redux";

import { getUser } from "metabase/selectors/user";

import UserProfileForm from "../../components/UserProfileForm";

const mapStateToProps = state => ({
  user: getUser(state),
});

export default connect(mapStateToProps)(UserProfileForm);
