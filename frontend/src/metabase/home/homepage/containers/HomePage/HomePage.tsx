import { connect } from "react-redux";
import { openNavbar } from "metabase/redux/app";
import HomePage from "../../components/Homepage";

const mapDispatchToProps = {
  onOpenNavbar: openNavbar,
};

export default connect(null, mapDispatchToProps)(HomePage);
