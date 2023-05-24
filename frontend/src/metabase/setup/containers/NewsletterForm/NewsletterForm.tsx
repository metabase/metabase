import { connect } from "react-redux";
import { subscribeToNewsletter } from "metabase/setup/utils";
import NewsletterForm from "../../components/NewsletterForm";
import { getUserEmail, isLocaleLoaded } from "../../selectors";

const mapStateToProps = (state: any) => ({
  initialEmail: getUserEmail(state),
  isLocaleLoaded: isLocaleLoaded(state),
  onSubscribe: subscribeToNewsletter,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(NewsletterForm);
