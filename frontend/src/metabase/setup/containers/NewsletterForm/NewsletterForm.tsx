import { connect } from "react-redux";
import { subscribeToNewsletter } from "metabase/setup/utils";
import NewsletterForm from "../../components/NewsletterForm";
import { getUserEmail, isLocaleLoaded } from "../../selectors";

const mapStateToProps = (state: any) => ({
  initialEmail: getUserEmail(state),
  isLocaleLoaded: isLocaleLoaded(state),
});

const mapDispatchToProps = () => ({
  onSubscribe: subscribeToNewsletter,
});

export default connect(mapStateToProps, mapDispatchToProps)(NewsletterForm);
