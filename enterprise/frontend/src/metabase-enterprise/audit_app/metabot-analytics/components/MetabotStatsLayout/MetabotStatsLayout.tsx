import { MetabotAdminLayout } from "metabase/metabot/components/MetabotAdmin/MetabotAdminLayout";
import { Box } from "metabase/ui";

export const MetabotStatsLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <MetabotAdminLayout fullWidth>
    <Box py="lg" px="xl" maw="100rem">
      {children}
    </Box>
  </MetabotAdminLayout>
);
