import type { Route } from "react-router";

import { Box, Title } from "metabase/ui";

import { DatabaseEditConnectionForm } from "../components/DatabaseEditConnectionForm";
import { useDatabaseConnection } from "../hooks/use-database-connection";

interface DatabasePageProps {
  params: { databaseId: string };
  route: Route;
}

export function DatabasePage({ params, route }: DatabasePageProps) {
  const { database, databaseReq, handleCancel, handleOnSubmit, title, config } =
    useDatabaseConnection({ databaseId: params.databaseId });

  return (
    <Box
      w="100%"
      maw={{
        base: `calc(28.5rem + 2rem)`,
        md: `calc(28.5rem + 4rem)`,
      }}
      mx="auto"
      p={{
        base: `md`,
        md: `xl`,
      }}
    >
      <Title order={1} mb="lg">
        {title}
      </Title>
      <DatabaseEditConnectionForm
        database={database}
        isAttachedDWH={database?.is_attached_dwh ?? false}
        initializeError={databaseReq.error}
        onSubmitted={handleOnSubmit}
        route={route}
        onCancel={handleCancel}
        config={config}
        formLocation="full-page"
      />
    </Box>
  );
}
