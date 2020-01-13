/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Box, Flex } from "grid-styled";

import User from "metabase/entities/users";

import Radio from "metabase/components/Radio";
import UserAvatar from "metabase/components/UserAvatar";

import SetUserPassword from "./SetUserPassword";

export default class UserSettings extends Component {
  constructor(props) {
    super(props);
    this.state = { updateUserResult: null };
  }

  static propTypes = {
    tab: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired,
    setTab: PropTypes.func.isRequired,
    updatePassword: PropTypes.func.isRequired,
  };

  onUserSettingsSaved(details) {
    this.setState({
      updateUserResult: {
        success: true,
        data: { message: t`Account updated successfully!` },
      },
    });
  }

  onUserSettingsSaveFailed(errors) {
    // NB the actual error is showed by StandardForm.error
    this.setState({
      updateUserResult: {
        success: false,
        data: { message: t`Account update failed!` },
      },
    });
  }

  onUpdatePassword(details) {
    this.props.updatePassword(
      details.user_id,
      details.password,
      details.old_password,
    );
  }

  render() {
    const { tab, user, setTab } = this.props;
    const { updateUserResult } = this.state;

    return (
      <Box>
        <Flex
          bg="white"
          align="center"
          justifyContent="center"
          flexDirection="column"
          className="border-bottom"
          pt={[1, 2]}
        >
          <Flex
            align="center"
            justifyContent="center"
            flexDirection="column"
            p={[2, 2, 4]}
          >
            <UserAvatar user={user} mb={[1, 2]} size={["3em", "4em", "5em"]} />
            <h2>{t`Account settings`}</h2>
          </Flex>

          <Radio
            value={tab}
            underlined={true}
            options={[
              { name: t`Profile`, value: "details" },
              {
                name: t`Password`,
                value: "password",
              },
            ]}
            onChange={tab => setTab(tab)}
          />
        </Flex>
        <Box w={["100%", 540]} ml="auto" mr="auto" px={[1, 2]} pt={[1, 3]}>
          {tab === "details" ? (
            <User.Form
              {...this.props}
              formName="user"
              submitResultDetail={updateUserResult}
              onSaved={this.onUserSettingsSaved.bind(this)}
              onSaveFailed={this.onUserSettingsSaveFailed.bind(this)}
            />
          ) : tab === "password" ? (
            <SetUserPassword
              submitFn={this.onUpdatePassword.bind(this)}
              {...this.props}
            />
          ) : null}
        </Box>
      </Box>
    );
  }
}
