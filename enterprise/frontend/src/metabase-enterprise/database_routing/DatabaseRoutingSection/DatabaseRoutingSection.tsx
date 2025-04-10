import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { hasDbRoutingEnabled } from "metabase/admin/databases/utils";
import { skipToken, useListUserAttributesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
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
import * as Urls from "metabase-enterprise/urls";
import type { Database } from "metabase-types/api";

import { DestinationDatabasesList } from "../DestinationDatabasesList";

import { getDisabledFeatureMessage, getSelectErrorMessage } from "./utils";

export const DatabaseRoutingSection = ({
  database,
}: {
  database: Database;
}) => {
  const dispatch = useDispatch();

  const isAdmin = useSelector(getUserIsAdmin);
  const userAttribute = database.router_user_attribute ?? undefined;
  const shouldHideSection = database.is_attached_dwh || database.is_sample;

  const [tempEnabled, setTempEnabled] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const [updateRouterDatabase, { error }] = useUpdateRouterDatabaseMutation();
  const userAttrsReq = useListUserAttributesQuery(
    shouldHideSection ? skipToken : undefined,
  );
  const userAttributeOptions =
    userAttrsReq.data ?? (userAttribute ? [userAttribute] : []);

  const disabledFeatMsg = getDisabledFeatureMessage(database);
  const errMsg = getSelectErrorMessage({
    userAttribute,
    disabledFeatureMessage: disabledFeatMsg,
    hasNoUserAttributeOptions:
      !userAttrsReq.isLoading && userAttributeOptions.length === 0,
  });

  const handleUserAttributeChange = async (attribute: string) => {
    await updateRouterDatabase({ id: database.id, user_attribute: attribute });

    if (!hasDbRoutingEnabled(database)) {
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

      if (hasDbRoutingEnabled(database)) {
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
      description={t`Route user queries to a separate database with the same schema. When a user views a question or dashboard for this database, they’ll be routed to a destination database whose slug matches the value of that attribute.`}
      data-testid="database-routing-section"
    >
      <Flex justify="space-between" align="center">
        <Stack>
          <Label htmlFor="database-routing-toggle">
            <Text lh="lg">{t`Enable database routing`}</Text>
          </Label>
          {error ? (
            <Error role="alert" color="error">
              {String(error)}
            </Error>
          ) : null}
        </Stack>
        <Flex gap="md">
          <Tooltip label={disabledFeatMsg} disabled={!disabledFeatMsg}>
            <Box>
              <Switch
                id="database-routing-toggle"
                checked={tempEnabled || hasDbRoutingEnabled(database)}
                disabled={!!disabledFeatMsg || !isAdmin}
                onChange={(e) => handleToggle(e.currentTarget.checked)}
              />
            </Box>
          </Tooltip>
          <UnstyledButton onClick={() => setIsExpanded(!isExpanded)} px="xs">
            <Icon name={isExpanded ? "chevronup" : "chevrondown"} />
          </UnstyledButton>
        </Flex>
      </Flex>

      {isExpanded && (
        <>
          <DatabaseInfoSectionDivider />

          <Box mb="xl">
            <Flex justify="space-between" align="center">
              <Text>
                {t`User attribute to match destination database`}{" "}
                <Text component="span" c="error">
                  *
                </Text>
              </Text>
              <Tooltip
                label={t`This attribute will be used to determine which database a user is routed to. The value must match the slug of a destination database.`}
                withArrow
              >
                <Select
                  data-testid="db-routing-user-attribute"
                  placeholder={t`Choose an attribute`}
                  data={userAttributeOptions}
                  disabled={!isAdmin || !!disabledFeatMsg}
                  value={userAttribute}
                  onChange={handleUserAttributeChange}
                />
              </Tooltip>
            </Flex>
            {errMsg && <Error>{errMsg}</Error>}
          </Box>

          <Flex justify="space-between" align="center" mih="2.5rem">
            <Text fw="bold">{t`Destination databases`}</Text>
            {isAdmin && (
              <>
                {hasDbRoutingEnabled(database) ? (
                  <Button
                    component={Link}
                    to={Urls.createDestinationDatabase(database.id)}
                  >{t`Add`}</Button>
                ) : (
                  <Tooltip
                    label={t`Please choose a user attribute first`}
                    withArrow
                  >
                    <Button disabled>{t`Add`}</Button>
                  </Tooltip>
                )}
              </>
            )}
          </Flex>

          <DestinationDatabasesList
            primaryDatabaseId={database.id}
            previewCount={5}
          />
        </>
      )}
    </DatabaseInfoSection>
  );
};
