/* @flow */
import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

type Props = {
  databaseId: number,
  onClose: () => void,
  onDone: () => void,
};

export default class CreatedDatabaseModal extends Component {
  props: Props;

  render() {
    const { onClose, onDone, databaseId } = this.props;
    const xraysEnabled = MetabaseSettings.get("enable-xrays");
    return (
      <ModalContent title={t`Your database has been added!`} onClose={onClose}>
        <div className="mb4">
          <p>
            {xraysEnabled
              ? t`We took a look at your data, and we have some automated explorations that we can show you!`
              : t`We're currently analyzing the tables and fields to help you explore your data.`}
          </p>
        </div>

        <div className="flex layout-centered">
          {xraysEnabled && (
            <a className="link" onClick={onDone}>{t`I'm good thanks`}</a>
          )}
          {xraysEnabled ? (
            <Link
              to={`/explore/${databaseId}`}
              className="Button Button--primary ml-auto"
            >
              {t`Explore this data`}
            </Link>
          ) : (
            <Button primary onClick={onDone} ml="auto">
              {t`Done`}
            </Button>
          )}
        </div>
      </ModalContent>
    );
  }
}
