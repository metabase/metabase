import { Link } from "react-router";
import { t } from "ttag";

import { CodeSnippet } from "metabase/components/CodeSnippet";
import { Box, Button, Stack, Text, Title } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

interface FinalStepProps {
  database: DatabaseData;
  sandboxingColumn: any;
}

export const FinalStep = ({ sandboxingColumn }: FinalStepProps) => {
  const codeSnippet = `import { MetabaseProvider } from "@metabase/embedding-sdk-react";

function App() {
  return (
    <MetabaseProvider
      metabaseInstanceUrl="${window.location.origin}"
      jwtProviderUri="${window.location.origin}/sso/metabase"
    >
      <YourEmbeddedDashboard />
    </MetabaseProvider>
  );
}`;

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Title order={2}>{t`Your embedding is ready!`}</Title>
        <Text size="lg">
          {t`Here's a preview of your embedded dashboard and the code you'll need to add to your application.`}
        </Text>
      </Stack>

      <Box>
        <Title order={3} mb="md">{t`Preview`}</Title>
        <Box h={400} style={{ border: "1px solid #ddd", borderRadius: "4px" }}>
          <iframe
            src={`${window.location.origin}/embed/dashboard/1`}
            style={{ width: "100%", height: "100%", border: "none" }}
            title="Embedded Dashboard Preview"
          />
        </Box>
      </Box>

      <Box>
        <Title order={3} mb="md">{t`Code snippet`}</Title>
        <CodeSnippet code={codeSnippet} language="tsx" />
      </Box>

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

      <Button component={Link} to="/" size="lg" variant="filled">
        {t`Go to dashboard`}
      </Button>
    </Stack>
  );
};
