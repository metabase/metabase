import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { skipToken, useListUserAttributesQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Button,
  Flex,
  Icon,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { useUpdateRouterDatabaseMutation } from "metabase-enterprise/api";
import type Database from "metabase-lib/v1/metadata/Database";

import { RoutedDatabaesList } from "../RoutedDatabasesList";

export const DatabaseRoutingSection = ({
  database,
  refetchDatabase,
}: {
  database: Database;
  refetchDatabase: () => void;
}) => {
  const dispatch = useDispatch();

  const shouldHideSection = database.is_attached_dwh;
  const userAttribute = database.router_user_attribute ?? undefined;

  const [tempEnabled, setTempEnabled] = useState(false);
  const isFeatureEnabled = !!userAttribute;

  const isToggleEnabled = tempEnabled || isFeatureEnabled;
  const [isExpanded, setIsExpanded] = useState(false);

  const [updateRouterDatabase, { error }] = useUpdateRouterDatabaseMutation();
  const { data: userAttributeOptions = [] } = useListUserAttributesQuery(
    isToggleEnabled && !shouldHideSection ? undefined : skipToken,
  );

  const handleUserAttributeChange = async (attribute: string) => {
    await updateRouterDatabase({ id: database.id, user_attribute: attribute });
    refetchDatabase();

    if (!isFeatureEnabled) {
      dispatch(addUndo({ message: t`Database routing enabled` }));
    } else {
      dispatch(addUndo({ message: t`Database routing updated` }));
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setIsExpanded(enabled);
    setTempEnabled(enabled);
    if (!enabled) {
      await updateRouterDatabase({ id: database.id, user_attribute: null });
      refetchDatabase();

      if (isFeatureEnabled) {
        dispatch(addUndo({ message: t`Database routing disabled` }));
      }
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
        <Stack>
          <label htmlFor="database-routing-toggle">
            <Text lh="1.4">{t`Enable database routing`}</Text>
          </label>
          {error ? (
            <Text role="alert" color="error">
              {String(error)}
            </Text>
          ) : null}
        </Stack>
        <Flex gap="md">
          <Switch
            id="database-routing-toggle"
            labelPosition="left"
            checked={isToggleEnabled}
            onChange={e => handleToggle(e.currentTarget.checked)}
          />
          <UnstyledButton onClick={() => setIsExpanded(!isExpanded)} px="xs">
            <Icon name={isExpanded ? "chevronup" : "chevrondown"} />
          </UnstyledButton>
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
            {isFeatureEnabled ? (
              <Button
                component={Link}
                to={`/admin/databases/${database.id}/mirror/create`}
              >{t`Add`}</Button>
            ) : (
              <Tooltip
                label={t`Please choose a user attribute first`}
                withArrow
              >
                <Button disabled>{t`Add`}</Button>
              </Tooltip>
            )}
          </Flex>

          <RoutedDatabaesList
            primaryDatabaseId={database.id}
            previewCount={5}
          />
        </>
      )}
    </DatabaseInfoSection>
  );
};
