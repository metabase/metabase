import { connect } from "react-redux";
import Login from "../../components/Login";
import EmailButton from "../../components/EmailButton";
import GoogleButton from "../../components/GoogleButton/GoogleButton";

const mapStateToProps = () => ({
  providers: [
    {
      name: "google",
      Button: GoogleButton,
    },
    {
      name: "password",
      Button: EmailButton,
    },
  ],
});

export default connect(mapStateToProps)(Login);
