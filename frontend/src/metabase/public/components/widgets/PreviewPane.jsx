/* eslint-disable react/prop-types */
/* eslint-disable react/no-unknown-property */
import { Component } from "react";

import cx from "classnames";
import { PreviewPaneContainer } from "./PreviewPane.styled";

export default class PreviewPane extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: true,
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (nextProps.previewUrl !== this.props.previewUrl) {
      this.setState({ loading: true });
    }
  }

  render() {
    const { className, previewUrl, isTransparent } = this.props;
    return (
      <PreviewPaneContainer
        isTransparent={isTransparent}
        className={cx(className, "flex relative")}
        style={{ minHeight: 280 }}
      >
        <iframe
          className="flex-full"
          src={previewUrl}
          frameBorder={0}
          allowTransparency
          onLoad={() => this.setState({ loading: false })}
        />
      </PreviewPaneContainer>
    );
  }
}
