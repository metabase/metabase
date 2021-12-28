import { connect } from "react-redux";
import Login from "../../components/Login";
import PasswordButton from "../../components/PasswordButton";
import GoogleButton from "../../components/GoogleButton/GoogleButton";

const mapStateToProps = () => ({
  providers: [
    {
      name: "google",
      Button: GoogleButton,
    },
    {
      name: "password",
      Button: PasswordButton,
    },
  ],
});

export default connect(mapStateToProps)(Login);
