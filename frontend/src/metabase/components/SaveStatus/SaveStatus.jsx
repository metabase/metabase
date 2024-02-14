/* eslint-disable react/prop-types */
import { Component } from "react";

import { t } from "ttag";
import _ from "underscore";
import { Icon, Box } from "metabase/ui";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import {
  SaveStatusLoading,
  SaveStatusSuccess,
  SaveStatusError,
} from "./SaveStatus.styled";

export default class SaveStatus extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      saving: false,
      recentlySavedTimeout: null,
      error: null,
    };

    _.bindAll(this, "setSaving", "setSaved", "setSaveError", "clear");
  }

  setSaving() {
    clearTimeout(this.state.recentlySavedTimeout);
    this.setState({ saving: true, recentlySavedTimeout: null, error: null });
  }

  setSaved() {
    clearTimeout(this.state.recentlySavedTimeout);
    const recentlySavedTimeout = setTimeout(
      () => this.setState({ recentlySavedTimeout: null }),
      5000,
    );
    this.setState({
      saving: false,
      recentlySavedTimeout: recentlySavedTimeout,
      error: null,
    });
  }

  setSaveError(error) {
    this.setState({ saving: false, recentlySavedTimeout: null, error: error });
  }

  clear() {
    this.setState({ saving: false, recentlySavedTimeout: null, error: null });
  }

  render() {
    const { className } = this.props;
    const statusProps = { className, "data-testid": "save-status" };

    if (this.state.saving) {
      return (
        <SaveStatusLoading {...statusProps}>
          <LoadingSpinner size={20} />
          <Box ml="0.5rem">{t`Saving...`}</Box>
        </SaveStatusLoading>
      );
    } else if (this.state.error) {
      return (
        <SaveStatusError {...statusProps}>
          {t`Error:`} {String(this.state.error.message || this.state.error)}
        </SaveStatusError>
      );
    } else if (this.state.recentlySavedTimeout != null) {
      return (
        <SaveStatusSuccess {...statusProps}>
          <Icon name="check" size={16} />
          <Box ml="0.5rem">{t`Saved`}</Box>
        </SaveStatusSuccess>
      );
    } else {
      return null;
    }
  }
}
