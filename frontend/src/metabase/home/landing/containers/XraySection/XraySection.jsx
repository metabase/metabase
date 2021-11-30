import { connect } from "react-redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import XraySection from "../../components/XraySection";

const mapStateToProps = state => ({
  isAdmin: getUserIsAdmin(state),
});

export default connect(mapStateToProps)(XraySection);
