/* eslint-disable react/prop-types */
import { Component } from "react";

import { t } from "ttag";
import CopyToClipboard from "react-copy-to-clipboard";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

export default class CopyWidget extends Component {
  constructor(props) {
    super(props);
    this.state = {
      copied: false,
    };
  }
  onCopy = () => {
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };
  render() {
    const { value, className, style, ...props } = this.props;
    return (
      <CopyToClipboard text={value} onCopy={this.onCopy}>
        <div className={className} style={style} data-testid="copy-button">
          <Tooltip tooltip={t`Copied!`} isOpen={this.state.copied}>
            <Icon name="copy" {...props} />
          </Tooltip>
        </div>
      </CopyToClipboard>
    );
  }
}
