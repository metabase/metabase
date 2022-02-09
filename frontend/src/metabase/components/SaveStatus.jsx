import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { t } from "ttag";
import _ from "underscore";

export default class SaveStatus extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      saving: false,
      recentlySavedTimeout: null,
      error: null,
    };

    _.bindAll(this, "setSaving", "setSaved", "setSaveError");
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

  render() {
    if (this.state.saving) {
      return (
        <div className="SaveStatus mx2 px2 border-right">
          <LoadingSpinner size={24} />
        </div>
      );
    } else if (this.state.error) {
      return (
        <div className="SaveStatus mx2 px2 border-right text-error">
          {t`Error:`} {String(this.state.error.message || this.state.error)}
        </div>
      );
    } else if (this.state.recentlySavedTimeout != null) {
      return (
        <div className="SaveStatus mx2 px2 border-right flex align-center text-success">
          <Icon name="check" size={16} />
          <div className="ml1 h3 text-bold">{t`Saved`}</div>
        </div>
      );
    } else {
      return null;
    }
  }
}
