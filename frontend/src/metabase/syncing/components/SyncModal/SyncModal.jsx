import React from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
import { getSampleDatabase, xraysEnabled } from "../../selectors";

const propTypes = {
  sampleDatabase: PropTypes.object,
  xraysEnabled: PropTypes.bool,
  onClose: PropTypes.func,
};

export const SyncModal = ({ sampleDatabase, xraysEnabled, onClose }) => {
  return (
    <ModalContent
      title={t`Great, we're taking a look at your database!`}
      footer={
        sampleDatabase ? (
          <Link to={xraysEnabled ? `/explore/${sampleDatabase.id}` : "/"}>
            <Button primary>{t`Explore sample data`}</Button>
          </Link>
        ) : (
          <Link to="/">
            <Button primary>{t`Explore your Metabase`}</Button>
          </Link>
        )
      }
      onClose={onClose}
    >
      <div>
        <span>
          {t`You’ll be able to use individual tables as they finish syncing. `}
        </span>
        {sampleDatabase ? (
          <span>
            {jt`You can also explore our ${(
              <strong>{sampleDatabase.name}</strong>
            )} in the meantime if you want to get a head start.`}
          </span>
        ) : (
          <span>
            {t`Have a look around your Metabase in the meantime if you want to get a head start.`}
          </span>
        )}
      </div>
    </ModalContent>
  );
};

SyncModal.propTypes = propTypes;

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
  }),
  connect(state => ({
    sampleDatabase: getSampleDatabase(state),
    xraysEnabled: xraysEnabled(state),
  })),
)(SyncModal);
