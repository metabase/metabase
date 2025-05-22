import { useEffect, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { CodeSnippet } from "metabase/components/CodeSnippet";
import { Box, Button, Group, Stack, Text, Title } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const FinalStep = () => {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [currentDashboardIndex, setCurrentDashboardIndex] = useState(0);
  const { sandboxingColumn, createdDashboardIds } = useEmbeddingSetup();

  useEffect(() => {
    const fetchDashboards = async () => {
      try {
        const dashboardPromises = createdDashboardIds.map((id) =>
          fetch(`/api/dashboard/${id}`).then((res) => res.json()),
        );
        const dashboardData = await Promise.all(dashboardPromises);
        setDashboards(dashboardData);
      } catch (err) {
        console.error("Error fetching dashboards:", err);
      }
    };

    if (createdDashboardIds.length > 0) {
      fetchDashboards();
    }
  }, [createdDashboardIds]);

  const currentDashboard = dashboards[currentDashboardIndex];

  const getEmbedCode = (dashboard: Dashboard) => {
    return `import { MetabaseProvider } from "@metabase/embedding-sdk-react";

function App() {
  return (
    <MetabaseProvider
      metabaseInstanceUrl="${window.location.origin}"
      jwtProviderUri="${window.location.origin}/sso/metabase"
    >
      <iframe
        src="${window.location.origin}/embed/dashboard/${dashboard.id}"
        style={{ width: "100%", height: "600px", border: "none" }}
        title="${dashboard.name}"
      />
    </MetabaseProvider>
  );
}`;
  };

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Title
          order={2}
        >{t`Now, let's add these dashboards to your application.`}</Title>
        <Text size="lg">
          {t`Here are your embedded dashboards and the code you'll need to add to your application.`}
        </Text>
      </Stack>

      <Group>
        {dashboards.length > 0 && (
          <Box>
            <Title order={3} mb="md">{t`Preview`}</Title>
            <Box
              h={400}
              w="800px"
              style={{ border: "1px solid #ddd", borderRadius: "4px" }}
            >
              <iframe
                src={`${window.location.origin}/embed/dashboard/${currentDashboard.id}`}
                style={{ width: "100%", height: "100%", border: "none" }}
                title={currentDashboard.name}
              />
            </Box>
            <Box
              mt="md"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button
                variant="subtle"
                onClick={() =>
                  setCurrentDashboardIndex((prev) =>
                    prev > 0 ? prev - 1 : dashboards.length - 1,
                  )
                }
                disabled={dashboards.length <= 1}
              >
                {t`Previous`}
              </Button>
              <Text>{t`Dashboard ${currentDashboardIndex + 1} of ${dashboards.length}`}</Text>
              <Button
                variant="subtle"
                onClick={() =>
                  setCurrentDashboardIndex((prev) =>
                    prev < dashboards.length - 1 ? prev + 1 : 0,
                  )
                }
                disabled={dashboards.length <= 1}
              >
                {t`Next`}
              </Button>
            </Box>
          </Box>
        )}

        {currentDashboard && (
          <Box>
            <Title
              order={3}
              mb="md"
            >{t`Code snippet for ${currentDashboard.name}`}</Title>
            <CodeSnippet code={getEmbedCode(currentDashboard)} language="tsx" />
          </Box>
        )}

        {sandboxingColumn && (
          <Box>
            <Title order={3} mb="md">{t`Sandboxing column detected`}</Title>
            <Text>
              {t`We detected a potential column for data sandboxing: ${sandboxingColumn.name}. You can use this to restrict data access for different users.`}
            </Text>
            <Button
              component={Link}
              to="/admin/permissions"
              variant="filled"
              mt="md"
            >
              {t`Configure Permissions`}
            </Button>
          </Box>
        )}
      </Group>

      <Title order={2}>{t`How'd it go?`}</Title>
      <Button component={Link} to="/" size="lg" variant="filled" w="100%">
        {t`I see my dashboard in my app`}
      </Button>
      <Button
        component={Link}
        to="https://metabase.com/docs/latest/embedding/embedding-guide"
        size="lg"
        variant="outline"
        w="100%"
      >
        {t`I'm hitting issues`}
      </Button>
    </Stack>
  );
};
