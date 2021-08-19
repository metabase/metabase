import { connect } from "react-redux";
import UnsubscribeModal from "../components/UnsubscribeModal";

const mapStateToProps = () => ({
  type: "pulse",
});

export default connect(mapStateToProps)(UnsubscribeModal);
