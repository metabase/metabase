/* eslint-disable react/prop-types */
import { Component } from "react";

export default class AdminHeader extends Component {
  render() {
    return <h2 className="text-medium">{this.props.title}</h2>;
  }
}
