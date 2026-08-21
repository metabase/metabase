import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListEnginesQuery } from "metabase/api";
import { useParams } from "metabase/router";
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
import { isEngineKey } from "metabase-types/guards";

import { DatabaseEditConnectionForm } from "../components/DatabaseEditConnectionForm";
import {
  DatabaseHelpSidePanel,
  ENGINE_DOC_MAP,
} from "../components/DatabaseHelpSidePanel";
import { useDatabaseConnection } from "../hooks/use-database-connection";

import { trackHelpButtonClick } from "./analytics";

export function DatabasePage() {
  const params = useParams<{ databaseId: string }>();
  const { data: engines = {} } = useListEnginesQuery();
  const { database, databaseReq, handleCancel, handleOnSubmit, title, config } =
    useDatabaseConnection({ databaseId: params.databaseId, engines });
  const [showSidePanel, { open: openSidePanel, close: closeSidePanel }] =
    useDisclosure(false);
  // The database and its default engine both arrive asynchronously, so the engine
  // the user picked is tracked separately and takes precedence once it is set.
  const [pickedEngineKey, setPickedEngineKey] = useState<EngineKey>();
  const databaseEngineKey = isEngineKey(database?.engine)
    ? database.engine
    : undefined;
  const selectedEngineKey = pickedEngineKey ?? databaseEngineKey;
  const helpContentsExist =
    !!selectedEngineKey && !!ENGINE_DOC_MAP[selectedEngineKey];

  const onEngineChange = (engineKey?: string) => {
    setPickedEngineKey(isEngineKey(engineKey) ? engineKey : undefined);
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
    <Flex direction="row" h="100%" bg="background_page-secondary">
      <Box h="100%" w="100%" component={ScrollArea}>
        <Box w="100%" maw="54rem" mx="auto" p={{ base: "md", sm: "xl" }}>
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
              onCancel={handleCancel}
              config={config}
              formLocation="full-page"
              onEngineChange={onEngineChange}
            />
          </SettingsSection>
        </Box>
      </Box>
      {showSidePanel && selectedEngineKey && (
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
