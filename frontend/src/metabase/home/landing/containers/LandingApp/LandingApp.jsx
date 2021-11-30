import { connect } from "react-redux";
import LandingApp from "../../components/LandingApp";
import GreetingSection from "../../containers/GreetingSection";
import OurDataSection from "../../containers/OurDataSection";
import XraySection from "../../containers/XraySection";

const mapStateToProps = state => ({
  GreetingSection: GreetingSection,
  XraySection: XraySection,
  OurDataSection: OurDataSection,
  showXrays: true,
  showOurData: true,
});

export default connect(mapStateToProps)(LandingApp);
