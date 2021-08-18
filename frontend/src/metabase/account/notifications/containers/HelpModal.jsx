import { connect } from "react-redux";
import { getAdminEmail } from "../selectors";
import HelpModal from "../components/HelpModal";

const mapStateToProps = () => ({
  adminEmail: getAdminEmail(),
});

export default connect(mapStateToProps)(HelpModal);
