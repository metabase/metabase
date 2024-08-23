/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import ModalContent from "metabase/components/ModalContent";
import { Flex } from "metabase/ui";
export default class ChannelSetupModal extends Component {
  static propTypes = {
    onClose: PropTypes.func.isRequired,
    user: PropTypes.object.isRequired,
    entityNamePlural: PropTypes.string.isRequired,
    channels: PropTypes.array,
  };

  static defaultProps = {
    channels: ["email", "Slack"],
  };

  render() {
    const { onClose, user, entityNamePlural, channels } = this.props;

    return (
      <ModalContent
        onClose={onClose}
        title={
          user.is_superuser
            ? t`To send ${entityNamePlural}, you'll need to set up ${channels.join(
                t` or `,
              )} integration.`
            : t`To send ${entityNamePlural}, an admin needs to set up ${channels.join(
                t` or `,
              )} integration.`
        }
      >
        <Flex justify="center">
          <ChannelSetupMessage user={this.props.user} />
        </Flex>
      </ModalContent>
    );
  }
}
