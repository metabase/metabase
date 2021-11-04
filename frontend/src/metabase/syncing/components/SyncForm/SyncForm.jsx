import React from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";

const propTypes = {
  sampleDatabase: PropTypes.object,
  xraysEnabled: PropTypes.bool,
  onClose: PropTypes.func,
};

const SyncForm = ({ sampleDatabase, xraysEnabled, onClose }) => {
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

SyncForm.propTypes = propTypes;

export default SyncForm;
