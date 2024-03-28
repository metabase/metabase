import { useEffect, useState } from "react";

import { Box, Text } from "metabase/ui";

import { DashboardGridConnected } from "../DashboardGrid";

// import sampleDashboard from "./sampleDashboard.json";

export const SubscriptionsDashboard = () => {
  const [dashboardProps, setDashboardProps] = useState(null);
  useEffect(() => {
    // @ts-expect-error TODO: add types
    window.render = (dashboardJson: string) => {
      const dashboardProps = JSON.parse(dashboardJson);
      setDashboardProps(dashboardProps);
    };
  }, []);

  if (dashboardProps === null) {
    return <div>Set dashboard using windows.render(dashboard)</div>;
  }

  return (
    <Box p={20}>
      <Text size="xl" fw="bold" mb={24}>
        {dashboardProps.dashboard.name}
      </Text>
      <DashboardGridConnected
        {...dashboardProps}
        onUpdateDashCardVisualizationSettings={() => null}
        onReplaceAllDashCardVisualizationSettings={() => null}
        slowCards={{}}
      />
    </Box>
  );
};
