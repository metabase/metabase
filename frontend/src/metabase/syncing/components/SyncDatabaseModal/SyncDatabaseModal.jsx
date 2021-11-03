import React from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";

const propTypes = {
  xraysEnabled: PropTypes.bool,
  onClose: PropTypes.func,
};

const SyncDatabaseModal = ({ xraysEnabled, onClose }) => {
  return (
    <ModalContent
      title={t`Great, we're taking a look at your database!`}
      footer={
        <Link to={xraysEnabled ? "/explore/1" : "/"}>
          <Button primary>{t`Explore sample data`}</Button>
        </Link>
      }
      onClose={onClose}
    >
      {t`You’ll be able to use individual tables as they finish syncing. `}
      {jt`You can also explore our ${(
        <strong>{t`Sample Dataset`}</strong>
      )} in the meantime if you want to get a head start.`}
    </ModalContent>
  );
};

SyncDatabaseModal.propTypes = propTypes;

export default SyncDatabaseModal;
