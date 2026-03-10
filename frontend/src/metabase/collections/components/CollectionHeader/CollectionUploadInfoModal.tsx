import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Modal } from "metabase/ui";

import {
  InfoModalBody,
  InfoModalContainer,
  InfoModalTitle,
  NewBadge,
} from "./CollectionUpload.styled";

export const UploadInfoModal = ({
  isAdmin,
  onClose,
}: {
  isAdmin: boolean;
  onClose: () => void;
}) => {
  const applicationName = useSelector(getApplicationName);
  return (
    <Modal
      opened
      onClose={onClose}
      size="30rem"
      padding="2rem"
      styles={{ header: { marginBottom: "1rem" } }}
    >
      <InfoModalContainer>
        <NewBadge>{t`New`}</NewBadge>
        <InfoModalTitle>{t`Upload CSVs to ${applicationName}`}</InfoModalTitle>
        {isAdmin ? (
          <>
            <InfoModalBody>
              <p>
                {t`Team members will be able to upload CSV files and work with them just like any other data source.`}
              </p>
              <p>
                {t`You'll be able to pick the default database where the data should be stored when enabling the feature.`}
              </p>
            </InfoModalBody>
            <Button as={Link} to="/admin/settings/uploads" primary role="link">
              {t`Go to setup`}
            </Button>
          </>
        ) : (
          <>
            <InfoModalBody>
              <p>
                {t`You'll need to ask your admin to enable this feature to get started. Then, you'll be able to upload CSV files and work with them just like any other data source.`}
              </p>
            </InfoModalBody>
            <Button onClick={onClose}>{t`Got it`}</Button>
          </>
        )}
      </InfoModalContainer>
    </Modal>
  );
};
