import React, { Component } from "react";

export default class Smile extends Component {
  render() {
    const styles = {
      width: "48px",
      height: "48px",
      backgroundImage: 'url("app/assets/img/smile.svg")',
    };
    return <div style={styles} className="hide md-show" />;
  }
}
