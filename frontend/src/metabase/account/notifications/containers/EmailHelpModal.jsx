import { connect } from "react-redux";
import { getAdminEmail } from "../selectors";
import EmailHelpModal from "../components/EmailHelpModal";

const mapStateToProps = () => ({
  adminEmail: getAdminEmail(),
});

export default connect(mapStateToProps)(EmailHelpModal);
