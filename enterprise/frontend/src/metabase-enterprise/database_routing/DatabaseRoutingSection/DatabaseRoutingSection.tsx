import { t } from "ttag";

import type Database from "metabase-lib/v1/metadata/Database";
import {
  Button,
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
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { useMemo, useState } from "react";
import {
  skipToken,
  useGetDatabaseQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { useUpdateRouterDatabaseMutation } from "metabase-enterprise/api";
import { Link } from "react-router";
import { RoutedDatabaesList } from "../RoutedDatabasesList";

// TODO: remove
const DB_ROUTER_USER_ATTRIBUTE = "test";

// TODO: make a smart component and loading state for this component as a parent
// that way this component can be a bit more dumb and focus solely on the presentation

export const DatabaseRoutingSection = ({
  database,
}: {
  database: Database;
}) => {
  const rtkDatabaseReq = useGetDatabaseQuery({
    id: database.id,
  });

  // TODO: get cache invalidation working and the database value to
  // reactively update when it is updated (feature is turned on or off)

  const [updateRouterDatabase] = useUpdateRouterDatabaseMutation();

  const shouldHideSection = database.is_attached_dwh;

  // TODO: add a loading state, it's weird that this value changes and you see the toggle animate between values
  const [tempEnabled, setTempEnabled] = useState(false);
  const isEnabled = useMemo(() => {
    return tempEnabled || !!rtkDatabaseReq.currentData?.router_user_attribute;
  }, [tempEnabled, rtkDatabaseReq.currentData?.router_user_attribute]);

  const [isExpanded, setIsExpanded] = useState(false);

  // TODO: impl
  const [userAttribute, setUserAttribute] = useState(DB_ROUTER_USER_ATTRIBUTE);
  const { data: userAttributeOptions = [] } = useListUserAttributesQuery(
    isEnabled && !shouldHideSection ? undefined : skipToken,
  );

  const handleUserAttributeChange = async (attribute: string) => {
    // TODO: handle loading / error states
    await updateRouterDatabase({ id: database.id, user_attribute: attribute });
    setUserAttribute(attribute);
  };

  // TODO: impl
  const handleAddMirrorDatabase = () => {};

  const handleToggle = async (enabled: boolean) => {
    // TODO: replace with a db update
    // setIsEnabled(enabled);
    setIsExpanded(enabled);
    setTempEnabled(enabled);
    // TODO: error handling
    if (!enabled) {
      await updateRouterDatabase({ id: database.id, user_attribute: null });
    }
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
            onChange={e => handleToggle(e.currentTarget.checked)}
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
            <Button
              component={Link}
              to={`/admin/databases/${database.id}/mirror/create`}
            >{t`Add`}</Button>
          </Flex>

          <RoutedDatabaesList database={database} previewCount={5} />
        </>
      )}
    </DatabaseInfoSection>
  );
};
