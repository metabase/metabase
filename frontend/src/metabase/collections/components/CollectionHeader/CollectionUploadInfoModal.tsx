import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Modal, Stack, Text } from "metabase/ui";

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
      layout="centered"
      illustration={
        <Text
          component="div"
          px="sm"
          py="xxs"
          fz="md"
          fw={700}
          c="core-brand"
          bg="background_surface-brand-subtle"
          bdrs="xs"
        >
          {t`New`}
        </Text>
      }
      title={t`Upload CSVs to ${applicationName}`}
    >
      {isAdmin ? (
        <>
          <Stack gap="md" ta="start">
            <Text c="text-secondary">
              {t`Team members will be able to upload CSV files and work with them just like any other data source.`}
            </Text>
            <Text c="text-secondary">
              {t`You'll be able to pick the default database where the data should be stored when enabling the feature.`}
            </Text>
          </Stack>
          <Modal.Footer>
            <Button
              component={Link}
              to="/admin/settings/uploads"
              variant="filled"
              role="link"
            >
              {t`Go to setup`}
            </Button>
          </Modal.Footer>
        </>
      ) : (
        <>
          <Text c="text-secondary">
            {t`You'll need to ask your admin to enable this feature to get started. Then, you'll be able to upload CSV files and work with them just like any other data source.`}
          </Text>
          <Modal.Footer>
            <Button variant="filled" onClick={onClose}>
              {t`Got it`}
            </Button>
          </Modal.Footer>
        </>
      )}
    </Modal>
  );
};
