/* @flow */
import React, { Component } from "react";
import { Link } from "react-router";
import { t } from "c-3po";

import ModalContent from "metabase/components/ModalContent.jsx";

type Props = {
  databaseId: number,
  onClose: () => void,
  onDone: () => void,
};
export default class CreatedDatabaseModal extends Component {
  props: Props;

  render() {
    const { onClose, onDone, databaseId } = this.props;
    return (
      <ModalContent title={t`Your database has been added!`} onClose={onClose}>
        <div className="mb4">
          <p>
            {t`We took a look at your data, and we have some automated explorations that we can show you!`}
          </p>
        </div>

        <div className="flex layout-centered">
          <a className="link" onClick={onDone}>{t`I'm good thanks`}</a>
          <Link
            to={`/explore/${databaseId}`}
            className="Button Button--primary ml-auto"
          >
            {t`Explore this data`}
          </Link>
        </div>
      </ModalContent>
    );
  }
}
