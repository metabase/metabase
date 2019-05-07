import { Component } from "react";
import { connect } from "react-redux";

import { logout } from "../auth";

const mapStateToProps = null;

const mapDispatchToProps = {
  logout,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class LogoutApp extends Component {
  componentWillMount() {
    this.props.logout();
  }

  render() {
    return null;
  }
}
