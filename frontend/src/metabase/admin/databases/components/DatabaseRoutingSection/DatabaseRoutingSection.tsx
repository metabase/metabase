import { t } from "ttag";

import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId } from "metabase-types/api";
import {
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Select,
  Switch,
  Text,
  UnstyledButton,
} from "metabase/ui";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "../DatabaseInfoSection";
import { useState } from "react";
import { skipToken, useListUserAttributesQuery } from "metabase/api";

export const DatabaseRoutingSection = ({
  database,
}: {
  isAdmin: boolean;
  database: Database;
  deleteDatabase: (databaseId: DatabaseId) => Promise<void>;
}) => {
  const shouldHideSection = database.is_attached_dwh;

  const [isEnabled, setIsEnabled] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // TODO: impl
  const [userAttribute, setUserAttribute] = useState("");
  const { data: userAttributeOptions = [] } = useListUserAttributesQuery(
    isEnabled && !shouldHideSection ? undefined : skipToken,
  );
  const handleUserAttributeChange = (value: string) => {
    console.log("TODO: impl");
    setUserAttribute(value);
  };
  const handleAddMirrorDatabase = () => console.log("TODO: impl");
  const mirrorDatabases = [];

  const handleToggleEnabled = (enabled: boolean) => {
    setIsEnabled(enabled);
    setIsExpanded(enabled);
  };

  if (shouldHideSection) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Database routing`}
      description={t`Run queries against a separate database with the same schema based on a user attribute.`}
      data-testid="database-routing-section"
    >
      <Flex justify="space-between" align="center">
        <label htmlFor="database-routing-toggle">
          <Text lh="1.4">{t`Enable database routing`}</Text>
        </label>
        <Flex gap="md">
          <Switch
            id="database-routing-toggle"
            labelPosition="left"
            checked={isEnabled}
            onChange={e => handleToggleEnabled(e.currentTarget.checked)}
          />
          {isEnabled && (
            <UnstyledButton onClick={() => setIsExpanded(!isExpanded)} px="xs">
              <Icon name={isExpanded ? "chevronup" : "chevrondown"} />
            </UnstyledButton>
          )}
        </Flex>
      </Flex>

      {isExpanded && (
        <>
          <DatabaseInfoSectionDivider />

          <Flex justify="space-between" align="center" mb="xl">
            <Text>{t`User attribute to use for connection slug`}</Text>
            <Select
              placeholder={t`Choose an attribute`}
              data={userAttributeOptions}
              value={userAttribute}
              onChange={handleUserAttributeChange}
            />
          </Flex>

          <Flex justify="space-between" align="center">
            <Text fw="bold">{t`Destination databases`}</Text>
            <Button onClick={handleAddMirrorDatabase}>{t`Add`}</Button>
          </Flex>

          <Box>
            {mirrorDatabases.length === 0 ? (
              <Text
                ta="center"
                mt="5rem"
                mb="3.5rem"
              >{t`No destination databases added yet`}</Text>
            ) : (
              <>
                <Text>{t`Name`}</Text>
                <Divider />
              </>
            )}
          </Box>
        </>
      )}
    </DatabaseInfoSection>
  );
};
