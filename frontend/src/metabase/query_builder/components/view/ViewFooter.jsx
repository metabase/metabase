import React from "react";

import ViewSection from "./ViewSection";

export default class ViewFooter extends React.Component {
  render() {
    const { question } = this.props;
    return (
      <ViewSection bottom>
        <span className="h3 text-medium">
          {`Visualization:`} {question.display()}
        </span>
      </ViewSection>
    );
  }
}
