import React, { Component } from "react";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";

// TODO: port to ErrorMessage for more consistent style

export default class Unauthorized extends Component {
  render() {
    return (
      <div className="flex layout-centered flex-full flex-column text-grey-2">
        <Icon name="key" size={100} />
        <h1 className="mt4">{t`Sorry, you don’t have permission to see that.`}</h1>
      </div>
    );
  }
}
