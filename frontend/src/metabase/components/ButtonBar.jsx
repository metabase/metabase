import React, { Component } from "react";

export default class ButtonBar extends Component {
  static defaultProps = {
    buttons: [],
    className: "",
  };

  render() {
    const { buttons, className } = this.props;

    return (
      <div className="flex align-center">
        {buttons.filter(v => v && v.length > 0).map((section, sectionIndex) => (
          <span key={sectionIndex} className={className}>
            {section}
          </span>
        ))}
      </div>
    );
  }
}
