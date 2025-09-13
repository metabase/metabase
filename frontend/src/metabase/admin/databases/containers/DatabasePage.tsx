import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { getEngines } from "metabase/databases/selectors";
import { useSelector } from "metabase/lib/redux";
import {
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  ScrollArea,
  Text,
  Title,
} from "metabase/ui";
import type { EngineKey } from "metabase-types/api";

import { DatabaseEditConnectionForm } from "../components/DatabaseEditConnectionForm";
import { DatabaseHelpSidePanel } from "../components/DatabaseHelpSidePanel";
import { useDatabaseConnection } from "../hooks/use-database-connection";

interface DatabasePageProps {
  params: { databaseId: string };
  route: Route;
}

export function DatabasePage({ params, route }: DatabasePageProps) {
  const engines = useSelector(getEngines);
  const { database, databaseReq, handleCancel, handleOnSubmit, title, config } =
    useDatabaseConnection({ databaseId: params.databaseId, engines });
  const [showSidePanel, { toggle: toggleSidePanel }] = useDisclosure(false);
  const [selectedEngineKey, setSelectedEngineKey] = useState<EngineKey>(
    database?.engine as EngineKey,
  );

  const onEngineChange = (engineKey?: string) => {
    setSelectedEngineKey(engineKey as EngineKey);
  };

  return (
    <Flex direction="row" h="100%">
      <Box h="100%" w="100%" component={ScrollArea}>
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
          <Flex mb="lg" align="center" justify="space-between">
            <Title order={1} fz="h2">
              {title}
            </Title>
            {!!selectedEngineKey && (
              <Text>
                {t`Need a hand?`}{" "}
                <Button
                  h="auto"
                  onClick={toggleSidePanel}
                  p={0}
                  style={{ verticalAlign: "baseline" }}
                  variant="subtle"
                >
                  {t`Help is here`}
                  <Icon name="chevronright" size={12} ml="xs" />
                </Button>
              </Text>
            )}
          </Flex>
          <DatabaseEditConnectionForm
            database={database}
            isAttachedDWH={database?.is_attached_dwh ?? false}
            initializeError={databaseReq.error}
            onSubmitted={handleOnSubmit}
            route={route}
            onCancel={handleCancel}
            config={config}
            formLocation="full-page"
            onEngineChange={onEngineChange}
          />
        </Box>
      </Box>
      {showSidePanel && !!selectedEngineKey && (
        <>
          <Divider orientation="vertical" h="100%" />
          <Flex h="100%" flex="1 0 26.5rem" component={ScrollArea}>
            <DatabaseHelpSidePanel
              engineKey={selectedEngineKey}
              onClose={toggleSidePanel}
            />
          </Flex>
        </>
      )}
    </Flex>
  );
}
