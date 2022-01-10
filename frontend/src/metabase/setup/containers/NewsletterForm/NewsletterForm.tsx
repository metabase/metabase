import { connect } from "react-redux";
import { subscribeToNewsletter } from "metabase/setup/utils";
import NewsletterForm from "../../components/NewsletterForm";
import { getUserEmail } from "../../selectors";

const mapStateToProps = (state: any) => ({
  initialEmail: getUserEmail(state),
});

const mapDispatchToProps = () => ({
  onSubscribe: subscribeToNewsletter,
});

export default connect(mapStateToProps, mapDispatchToProps)(NewsletterForm);
