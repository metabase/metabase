import { connect } from "react-redux";
import { getAdminEmail } from "../selectors";
import EmailHelpForm from "../components/EmailHelpForm";

const mapStateToProps = () => ({
  adminEmail: getAdminEmail(),
});

export default connect(mapStateToProps)(EmailHelpForm);
