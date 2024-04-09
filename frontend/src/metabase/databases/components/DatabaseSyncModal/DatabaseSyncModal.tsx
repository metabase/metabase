import cx from "classnames";
import { jt, t } from "ttag";

import { useListDatabaseCandidatesQuery, skipToken } from "metabase/api";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { useSetting } from "metabase/common/hooks/use-setting";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import ButtonsS from "metabase/css/components/buttons.module.css";
import type { DatabaseCandidate, TableCandidate } from "metabase-types/api";

import {
  ModalMessage,
  ModalIllustration,
  ModalRoot,
  ModalTitle,
  ModalBody,
  ModalCloseIcon,
} from "./DatabaseSyncModal.styled";

const getSampleUrl = (candidates: DatabaseCandidate[]) => {
  const tables = candidates.flatMap(d => d.tables);
  const table =
    tables.find((t: TableCandidate) => t.title.includes("Orders")) ?? tables[0];
  return table?.url;
};

const useSampleDatabaseLink = () => {
  const { data: databases } = useDatabaseListQuery();
  const xraysEnabled = useSetting("enable-xrays");
  const sampleDatabase = databases?.find(d => d.is_sample);

  const { data: databaseCandidates } = useListDatabaseCandidatesQuery(
    sampleDatabase?.id && xraysEnabled ? sampleDatabase.id : skipToken,
  );

  const sampleUrl = databaseCandidates
    ? getSampleUrl(databaseCandidates)
    : undefined;

  return sampleUrl;
};

export interface DatabaseSyncModalProps {
  sampleUrl?: string;
  onClose?: () => void;
}

export const DatabaseSyncModalView = ({
  sampleUrl,
  onClose,
}: DatabaseSyncModalProps) => {
  return (
    <ModalRoot>
      <ModalBody>
        <ModalIllustration
          src="app/img/syncing-illustration.svg"
          width={148}
          height={109}
        />
        <ModalTitle>{t`We're taking a look at your database!`}</ModalTitle>
        <ModalMessage>
          {t`You’ll be able to use individual tables as they finish syncing.`}{" "}
          {sampleUrl
            ? jt`In the meantime, you can take a look at the ${(
                <strong key="name">{t`Sample Database`}</strong>
              )} if you want to get a head start. Want to explore?`
            : // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
              t`Have a look around your Metabase in the meantime if you want to get a head start.`}
        </ModalMessage>
        {sampleUrl ? (
          <Link
            className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
            to={sampleUrl}
          >
            {t`Explore sample data`}
          </Link>
        ) : (
          <Button primary onClick={onClose}>
            {t`Got it`}
          </Button>
        )}
      </ModalBody>
      {onClose && <ModalCloseIcon name="close" onClick={onClose} />}
    </ModalRoot>
  );
};

export const DatabaseSyncModal = ({ onClose }: { onClose: () => void }) => {
  const sampleUrl = useSampleDatabaseLink();

  return <DatabaseSyncModalView sampleUrl={sampleUrl} onClose={onClose} />;
};
