import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { _FileUploadErrorModal } from "metabase/status/components/FileUploadStatusLarge/FileUploadErrorModal";
import { Box, Button, Modal, Text } from "metabase/ui";

import databaseError from "./database-error.svg?component";

function PausedModal({ onClose }: { onClose: () => void }) {
  const storeUrl = useStoreUrl("account/storage");
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <Modal
      opened
      onClose={onClose}
      layout="centered"
      illustration={<Box component={databaseError} />}
      title={t`Couldn't upload the file, storage is full`}
    >
      <Text c="text-secondary">
        {isAdmin
          ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin only
            t`Add more storage to your Metabase or connect a database to store the uploaded files.`
          : t`Please contact your admin to add more storage.`}
      </Text>
      <Modal.Footer>
        {isAdmin ? (
          <>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              component={ExternalLink}
              href={storeUrl}
              target="_blank"
            >
              {t`Add more storage`}
            </Button>
          </>
        ) : (
          <Button variant="filled" onClick={onClose}>
            {t`OK`}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export const FileUploadErrorModal = ({
  onClose,
  fileName,
  children,
}: {
  onClose: () => void;
  fileName?: string;
  children: string;
}) => {
  const uploadsSettings = useSetting("uploads-settings");
  const { data: dbInfo } = useGetDatabaseQuery(
    uploadsSettings?.db_id ? { id: uploadsSettings.db_id } : skipToken,
  );

  const isDwh = dbInfo?.is_attached_dwh;
  const showPausedError = isDwh && isPausedError(children);

  if (showPausedError) {
    console.error(children);

    return <PausedModal onClose={onClose} />;
  }

  return (
    <_FileUploadErrorModal onClose={onClose} fileName={fileName} opened>
      {children}
    </_FileUploadErrorModal>
  );
};

function isPausedError(message: string) {
  return message.includes("Code: 497");
}
