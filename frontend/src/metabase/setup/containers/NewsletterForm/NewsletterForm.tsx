import { connect } from "react-redux";
import { subscribeToNewsletter } from "metabase/setup/utils";
import NewsletterForm from "../../components/NewsletterForm";
import { getUserEmail, getIsLocaleLoaded } from "../../selectors";

const mapStateToProps = (state: any) => ({
  initialEmail: getUserEmail(state),
  isLocaleLoaded: getIsLocaleLoaded(state),
  onSubscribe: subscribeToNewsletter,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(NewsletterForm);
