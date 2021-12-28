import { connect } from "react-redux";
import Login from "../../components/Login";
import EmailButton from "../../components/EmailButton";

const mapStateToProps = () => ({
  providers: [
    {
      name: "password",
      Button: EmailButton,
    },
  ],
});

export default connect(mapStateToProps)(Login);
