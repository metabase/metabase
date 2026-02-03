import { Link } from "react-router";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box, Button, Stack, rem } from "metabase/ui";

export const NoDatabasesEmptyState = () => {
  return (
    <Stack align="center" gap="lg" h="100%" justify="center">
      <Box maw={rem(268)}>
        <EmptyState
          illustrationElement={<img src={EmptyDashboardBot} />}
          title={t`No connected databases`}
          message={t`Once you connect to your data, you can add and edit metadata here.`}
        />
      </Box>

      {/* no need to check if user is admin because this page can only be viewed by admins */}
      <Button
        component={Link}
        size="md"
        to="/admin/databases/create"
        variant="primary"
      >{t`Connect a database`}</Button>
    </Stack>
  );
};
