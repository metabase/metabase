import { Flex, Icon, Text } from "metabase/ui";

export const DashboardSaveLocation = ({
  dashboardName,
}: {
  dashboardName: string;
}) => (
  <Text size="sm" fw="bold" color="text-light">
    <Flex align="center" gap="sm" color="text-light">
      <Icon name="dashboard" size={12} />
      {dashboardName}
    </Flex>
  </Text>
);
