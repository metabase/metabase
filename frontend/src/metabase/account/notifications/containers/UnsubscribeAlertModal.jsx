import { connect } from "react-redux";
import UnsubscribeModal from "../components/UnsubscribeModal";

const mapStateToProps = () => ({
  type: "alert",
});

export default connect(mapStateToProps)(UnsubscribeModal);
