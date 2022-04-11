import { connect } from "react-redux";
import { IFRAMED } from "metabase/lib/dom";
import SSOButton from "../../components/SSOButton";
import { loginSSO } from "../../actions";

const mapStateToProps = () => ({
  isEmbedded: IFRAMED,
});

const mapDispatchToProps = {
  onLogin: loginSSO,
};

export default connect(mapStateToProps, mapDispatchToProps)(SSOButton);
