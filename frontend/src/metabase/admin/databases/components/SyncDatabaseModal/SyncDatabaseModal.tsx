import React from "react";
import { t, jt } from "ttag";
import * as Urls from "metabase/lib/urls";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
import { Database } from "../../types";

interface Props {
  sampleDatabase?: Database;
  showXrays?: boolean;
  onClose?: () => void;
}

const SyncDatabaseModal = ({ sampleDatabase, showXrays, onClose }: Props) => {
  return (
    <ModalContent
      title={t`Great, we're taking a look at your database!`}
      footer={
        sampleDatabase ? (
          <Link to={showXrays ? Urls.exploreDatabase(sampleDatabase) : "/"}>
            <Button primary onClick={onClose}>{t`Explore sample data`}</Button>
          </Link>
        ) : (
          <Link to="/">
            <Button
              primary
              onClick={onClose}
            >{t`Explore your Metabase`}</Button>
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
              <strong key="name">{sampleDatabase.name}</strong>
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

export default SyncDatabaseModal;
