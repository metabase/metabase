/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";

import colors from "metabase/lib/colors";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import fitViewport from "metabase/hoc/FitViewPort";

import { SettingsApi } from "metabase/services";

@fitViewport
export default class Activate extends React.Component {
  state = {
    heading: t`Enter the token you received from the store`,
    errorMessage: "",
    showVerbose: false,
    error: false,
  };
  activate = async () => {
    const value = this._input.value.trim();
    if (!value) {
      return false;
    }
    try {
      await SettingsApi.put({ key: "premium-embedding-token", value });
      // set window.location so we do a hard refresh
      window.location = "/admin/store";
    } catch (e) {
      console.error(e.data);
      this.setState({
        error: true,
        heading: e.data.message,
        errorMessage: e.data["error-details"],
      });
    }
  };
  render() {
    return (
      <Flex
        align="center"
        justify="center"
        className={this.props.fitClassNames}
      >
        <Flex align="center" flexDirection="column">
          <Box my={3}>
            <h2
              className="text-centered"
              style={{ color: this.state.error ? colors["error"] : "inherit" }}
            >
              {this.state.heading}
            </h2>
          </Box>
          <Box>
            <input
              ref={ref => (this._input = ref)}
              type="text"
              className="input"
              placeholder="XXXX-XXXX-XXXX-XXXX"
            />
            <Button ml={1} onClick={this.activate}>{t`Activate`}</Button>
          </Box>

          {this.state.error && (
            <ModalWithTrigger
              triggerElement={
                <Box mt={3}>
                  <Link
                    className="link"
                    onClick={() => this.setState({ showVerbose: true })}
                  >{t`Need help?`}</Link>
                </Box>
              }
              onClose={() => this.setState({ showVerbose: false })}
              title={t`More info about your problem.`}
              open={this.state.showVerbose}
            >
              <Box>{this.state.errorMessage}</Box>
              <Flex my={2}>
                <a
                  className="ml-auto"
                  href={`mailto:support@metabase.com?Subject="Issue with token activation for token ${this._input.value}"&Body="${this.state.errorMessage}"`}
                >
                  <Button primary>{t`Contact support`}</Button>
                </a>
              </Flex>
            </ModalWithTrigger>
          )}
        </Flex>
      </Flex>
    );
  }
}
