import { connect } from "react-redux";
import LandingLayout from "../../components/LandingLayout";
import GreetingSection from "../../containers/GreetingSection";
import OurDataSection from "../../containers/OurDataSection";

const mapStateToProps = state => ({
  GreetingSection: GreetingSection,
  OurDataSection: OurDataSection,
  showOurData: true,
});

export default connect(mapStateToProps)(LandingLayout);
