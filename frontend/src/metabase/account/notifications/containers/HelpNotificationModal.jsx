import { connect } from "react-redux";
import { getAdminEmail } from "../selectors";
import HelpNotificationForm from "../components/HelpNotificationForm";

const mapStateToProps = () => ({
  adminEmail: getAdminEmail(),
});

export default connect(mapStateToProps)(HelpNotificationForm);
