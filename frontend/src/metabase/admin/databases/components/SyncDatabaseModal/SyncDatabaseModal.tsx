import React from "react";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
import { Database, DatabaseCandidate, TableCandidate } from "../../types";

export interface SyncDatabaseModalProps {
  databases: Database[];
  databaseCandidates: DatabaseCandidate[];
  onClose?: () => void;
}

const SyncDatabaseModal = ({
  databases,
  databaseCandidates,
  onClose,
}: SyncDatabaseModalProps) => {
  const sampleDatabase = getSampleDatabase(databases);
  const sampleTable = getSampleTable(databaseCandidates);

  return (
    <ModalContent
      title={t`Great, we're taking a look at your database!`}
      footer={
        <Link to={sampleTable ? sampleTable.url : "/"}>
          <Button primary onClick={onClose}>
            {sampleTable ? t`Explore sample data` : t`Explore your Metabase`}
          </Button>
        </Link>
      }
      onClose={onClose}
    >
      <div>
        <span>
          {t`You’ll be able to use individual tables as they finish syncing.`}{" "}
        </span>
        {sampleTable && sampleDatabase ? (
          <span>
            {jt` In the meantime, you can take a look at the ${(
              <strong key="name">{sampleDatabase.name}</strong>
            )} if you want to get a head start. Want to explore?`}
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

const getSampleDatabase = (databases: Database[]): Database | undefined => {
  return databases.find(d => d.is_sample);
};

const getSampleTable = (
  databaseCandidates: DatabaseCandidate[],
): TableCandidate | undefined => {
  const tables = databaseCandidates.flatMap(d => d.tables);
  return tables.find(t => t.title.includes("Orders")) ?? tables[0];
};

export default SyncDatabaseModal;
