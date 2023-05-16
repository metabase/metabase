import { connect } from "react-redux";
import { isWithinIframe } from "metabase/lib/dom";
import SSOButton from "../../components/SSOButton";
import { loginSSO } from "../../actions";

const mapStateToProps = () => ({
  isEmbedded: isWithinIframe(),
});

const mapDispatchToProps = {
  onLogin: loginSSO,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(SSOButton);
