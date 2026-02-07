import { diffWords } from "diff";
import { Component } from "react";

interface TextDiffProps {
  diff: {
    before?: string;
    after?: string;
  };
}

export class TextDiff extends Component<TextDiffProps> {
  render() {
    const {
      diff: { before, after },
    } = this.props;
    return (
      <div>
        &quot;
        {before != null && after != null ? (
          diffWords(before, after).map((section, index) => (
            <span key={index}>
              {section.added ? (
                <strong>{section.value}</strong>
              ) : section.removed ? (
                <span style={{ textDecoration: "line-through" }}>
                  {section.value}
                </span>
              ) : (
                <span>{section.value}</span>
              )}{" "}
            </span>
          ))
        ) : before != null ? (
          <span style={{ textDecoration: "line-through" }}>{before}</span>
        ) : (
          <strong>{after}</strong>
        )}
        &quot;
      </div>
    );
  }
}
