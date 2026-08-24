import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Modal, Stack, Text, Title } from "metabase/ui";

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
      <Stack gap="md" align="center" justify="center">
        <Text
          component="div"
          px="sm"
          py="xs"
          fz="md"
          fw={700}
          c="core-brand"
          bg="background_surface-brand-subtle"
          mx="auto"
          bdrs="sm"
        >
          {t`New`}
        </Text>
        <Title order={2} ta="center" fz="xl">
          {t`Upload CSVs to ${applicationName}`}
        </Title>
        {isAdmin ? (
          <>
            <Box c="text-secondary">
              <p>
                {t`Team members will be able to upload CSV files and work with them just like any other data source.`}
              </p>
              <p>
                {t`You'll be able to pick the default database where the data should be stored when enabling the feature.`}
              </p>
            </Box>
            <Button
              component={Link}
              to="/admin/settings/uploads"
              variant="filled"
              role="link"
            >
              {t`Go to setup`}
            </Button>
          </>
        ) : (
          <>
            <Box c="text-secondary">
              <p>
                {t`You'll need to ask your admin to enable this feature to get started. Then, you'll be able to upload CSV files and work with them just like any other data source.`}
              </p>
            </Box>
            <Button onClick={onClose}>{t`Got it`}</Button>
          </>
        )}
      </Stack>
    </Modal>
  );
};
