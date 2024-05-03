import { t } from "ttag";

import {
  useGetCloudMigrationQuery,
  useCancleCloudMigrationMutation,
  useCreateCloudMigrationMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { Box, Button, Flex, Text } from "metabase/ui";

export const CloudPanel = () => {
  const dispatch = useDispatch();

  const { data: currentCloudMigration } = useGetCloudMigrationQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [createCloudMigration] = useCreateCloudMigrationMutation();
  const [cancleCloudMigration] = useCancleCloudMigrationMutation();

  const handleCreateMigration = async () => {
    await createCloudMigration();
    await dispatch(refreshSiteSettings({}));
  };

  const handleCancleMigration = async () => {
    await cancleCloudMigration();
    await dispatch(refreshSiteSettings({}));
  };

  return (
    <Box>
      {currentCloudMigration && (
        <Text mb="0.5rem">{`Status - ${currentCloudMigration.state}`}</Text>
      )}

      <Flex gap="0.5rem">
        <Button onClick={handleCreateMigration}>{t`Create Migration`}</Button>
        <Button onClick={handleCancleMigration}>{t`Cancle Migration`}</Button>
      </Flex>
    </Box>
  );
};
