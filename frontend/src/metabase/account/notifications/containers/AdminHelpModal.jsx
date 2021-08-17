import { connect } from "react-redux";
import { getAdminEmail } from "../selectors";
import AdminHelpModal from "../components/AdminHelpModal";

const mapStateToProps = () => ({
  adminEmail: getAdminEmail(),
});

export default connect(mapStateToProps)(AdminHelpModal);
