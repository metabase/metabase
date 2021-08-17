import { connect } from "react-redux";
import { getAdminEmail } from "../selectors";
import HelpNotificationModal from "../components/HelpNotificationModal";

const mapStateToProps = () => ({
  adminEmail: getAdminEmail(),
});

export default connect(mapStateToProps)(HelpNotificationModal);
