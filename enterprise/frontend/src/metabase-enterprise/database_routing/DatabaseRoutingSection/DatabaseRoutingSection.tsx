import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import {
  skipToken,
  useGetDatabaseQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Button,
  Flex,
  Icon,
  Select,
  Switch,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { useUpdateRouterDatabaseMutation } from "metabase-enterprise/api";
import type Database from "metabase-lib/v1/metadata/Database";

import { RoutedDatabaesList } from "../RoutedDatabasesList";

// TODO: make a smart component and loading state for this component as a parent
// that way this component can be a bit more dumb and focus solely on the presentation

export const DatabaseRoutingSection = ({
  database,
}: {
  database: Database;
}) => {
  const dispatch = useDispatch();
  const rtkDatabaseReq = useGetDatabaseQuery({
    id: database.id,
  });

  // TODO: get cache invalidation working and the database value to
  // reactively update when it is updated (feature is turned on or off)

  const [updateRouterDatabase] = useUpdateRouterDatabaseMutation();

  const userAttribute =
    rtkDatabaseReq.currentData?.router_user_attribute ?? undefined;
  const [tempEnabled, setTempEnabled] = useState(false);
  const isFeatureEnabled = !!userAttribute;
  const isToggleEnabled = tempEnabled || isFeatureEnabled;
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldHideSection = database.is_attached_dwh;

  const handleUserAttributeChange = async (attribute: string) => {
    await updateRouterDatabase({ id: database.id, user_attribute: attribute });
    if (!isFeatureEnabled) {
      dispatch(addUndo({ message: t`Database routing enabled` }));
    } else {
      dispatch(addUndo({ message: t`Database routing updated` }));
    }
  };

  const { data: userAttributeOptions = [] } = useListUserAttributesQuery(
    isToggleEnabled && !shouldHideSection ? undefined : skipToken,
  );

  const handleToggle = async (enabled: boolean) => {
    setIsExpanded(enabled);
    setTempEnabled(enabled);
    // TODO: error handling
    if (!enabled) {
      await updateRouterDatabase({ id: database.id, user_attribute: null });
      dispatch(addUndo({ message: t`Database routing disabled` }));
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
            checked={isToggleEnabled}
            onChange={e => handleToggle(e.currentTarget.checked)}
          />
          {isToggleEnabled && (
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
