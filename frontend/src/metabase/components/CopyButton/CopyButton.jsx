/* eslint-disable react/prop-types */
import { Component } from "react";

import { t } from "ttag";
import CopyToClipboard from "react-copy-to-clipboard";
import { Icon } from "metabase/core/components/Icon";
import { Tooltip, Text } from "metabase/ui";

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
          <Tooltip
            label={<Text fw={700} c="white">{t`Copied!`}</Text>}
            opened={this.state.copied}
          >
            <Icon name="copy" {...props} />
          </Tooltip>
        </div>
      </CopyToClipboard>
    );
  }
}
