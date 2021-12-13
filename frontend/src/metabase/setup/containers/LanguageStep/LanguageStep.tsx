import { connect } from "react-redux";
import LanguageStep from "../../components/LanguageStep";
import { setLocale } from "../../actions";
import { getLocales, getLocale } from "../../selectors";

const mapStateToProps = (state: any) => ({
  locales: getLocales(state),
  selectedLocale: getLocale(state),
});

const mapDispatchToProps = {
  onLocaleChange: setLocale,
};

export default connect(mapStateToProps, mapDispatchToProps)(LanguageStep);
