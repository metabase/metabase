import { connect } from "react-redux";
import Login from "../../components/Login";

const mapStateToProps = () => ({
  providers: [],
});

export default connect(mapStateToProps)(Login);
