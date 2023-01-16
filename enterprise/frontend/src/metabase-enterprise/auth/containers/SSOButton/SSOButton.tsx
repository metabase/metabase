import { connect } from "react-redux";
import { isIframe } from "metabase/lib/dom";
import SSOButton from "../../components/SSOButton";
import { loginSSO } from "../../actions";

const mapStateToProps = () => ({
  isEmbedded: isIframe(),
});

const mapDispatchToProps = {
  onLogin: loginSSO,
};

export default connect(mapStateToProps, mapDispatchToProps)(SSOButton);
