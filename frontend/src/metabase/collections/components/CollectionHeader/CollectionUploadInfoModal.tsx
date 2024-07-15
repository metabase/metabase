import { t } from "ttag";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

import {
  InfoModalTitle,
  InfoModalBody,
  NewBadge,
  InfoModalContainer,
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
    <Modal small>
      <ModalContent title=" " onClose={onClose}>
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
              <Button
                as={Link}
                to="/admin/settings/uploads"
                primary
                role="link"
              >
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
      </ModalContent>
    </Modal>
  );
};
