import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
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
import {
  DatabaseHelpSidePanel,
  ENGINE_DOC_MAP,
} from "../components/DatabaseHelpSidePanel";
import { useDatabaseConnection } from "../hooks/use-database-connection";

import { trackHelpButtonClick } from "./analytics";

interface DatabasePageProps {
  params: { databaseId: string };
  route: Route;
}

export function DatabasePage({ params, route }: DatabasePageProps) {
  const engines = useSelector(getEngines);
  const { database, databaseReq, handleCancel, handleOnSubmit, title, config } =
    useDatabaseConnection({ databaseId: params.databaseId, engines });
  const [showSidePanel, { open: openSidePanel, close: closeSidePanel }] =
    useDisclosure(false);
  const [selectedEngineKey, setSelectedEngineKey] = useState<EngineKey>(
    database?.engine as EngineKey,
  );
  const helpContentsExist =
    !!selectedEngineKey && !!ENGINE_DOC_MAP[selectedEngineKey];

  const onEngineChange = (engineKey?: string) => {
    setSelectedEngineKey(engineKey as EngineKey);
  };

  useEffect(() => {
    if (!helpContentsExist) {
      closeSidePanel();
    }
  }, [closeSidePanel, helpContentsExist]);

  const onHelpButtonClick = () => {
    if (!showSidePanel) {
      openSidePanel();
      trackHelpButtonClick();
    }
  };

  return (
    <Flex
      direction="row"
      h="100%"
      style={{ backgroundColor: "var(--mb-color-background-secondary)" }}
    >
      <Box h="100%" w="100%" component={ScrollArea}>
        <Box
          w="100%"
          maw="54rem"
          mx="auto"
          p={{
            base: `md`,
            sm: `xl`,
          }}
        >
          <Flex
            mb="lg"
            align="center"
            justify="space-between"
            wrap="wrap"
            columnGap="lg"
          >
            <Title order={1} fz="h2">
              {title}
            </Title>
            {helpContentsExist && (
              <Text>
                {t`Need a hand?`}{" "}
                <Button
                  h="auto"
                  onClick={onHelpButtonClick}
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
          <SettingsSection>
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
          </SettingsSection>
        </Box>
      </Box>
      {showSidePanel && (
        <>
          <Divider orientation="vertical" h="100%" />
          <DatabaseHelpSidePanel
            engineKey={selectedEngineKey}
            onClose={closeSidePanel}
          />
        </>
      )}
    </Flex>
  );
}
