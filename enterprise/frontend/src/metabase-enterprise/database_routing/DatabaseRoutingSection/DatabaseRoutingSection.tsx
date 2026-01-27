import { useEffect, useState } from "react";
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
import { getErrorMessage } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { useToast } from "metabase/common/hooks/use-toast";
import { useSelector } from "metabase/lib/redux";
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
import { renderUserAttributesForSelect } from "metabase-enterprise/sandboxes/utils";
import * as Urls from "metabase-enterprise/urls";
import type { Database } from "metabase-types/api";
import { isEngineKey } from "metabase-types/guards";

import { DestinationDatabasesList } from "../DestinationDatabasesList";

import { getDisabledFeatureMessage, getSelectErrorMessage } from "./utils";

export const DatabaseRoutingSection = ({
  database,
}: {
  database: Database;
}) => {
  const [sendToast] = useToast();

  const engines = useSetting("engines");

  const isAdmin = useSelector(getUserIsAdmin);
  const userAttribute = database.router_user_attribute ?? undefined;
  const dbSupportsRouting = database.features?.includes("database-routing");
  const engineKey = isEngineKey(database.engine) ? database.engine : undefined;
  const engine = engineKey ? engines[engineKey] : undefined;
  const dbRoutingInfo =
    engine?.["extra-info"]?.["db-routing-info"]?.text ??
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
    t`When someone views a question using data from this database, Metabase will send the queries to the destination database set by the person's user attribute. Each destination database must have identical schemas.`;
  const shouldHideSection =
    database.is_attached_dwh || database.is_sample || !dbSupportsRouting;

  const [tempEnabled, setTempEnabled] = useState(false);
  const enabled = tempEnabled || hasDbRoutingEnabled(database);

  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(
    function expandIfEnabled() {
      if (enabled) {
        setIsExpanded(true);
      }
    },
    [enabled],
  );

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
      sendToast({ message: t`Database routing enabled` });
    } else {
      sendToast({ message: t`Database routing updated` });
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setIsExpanded(enabled);
    setTempEnabled(enabled);
    if (!enabled) {
      await updateRouterDatabase({ id: database.id, user_attribute: null });

      if (hasDbRoutingEnabled(database)) {
        sendToast({ message: t`Database routing disabled` });
      }
    }
  };

  if (shouldHideSection) {
    return null;
  }

  return (
    <DatabaseInfoSection
      name={t`Database routing`}
      description={dbRoutingInfo}
      data-testid="database-routing-section"
    >
      <Flex justify="space-between" align="center">
        <Stack>
          <Label htmlFor="database-routing-toggle">
            <Text lh="lg">{t`Enable database routing`}</Text>
          </Label>
          {error ? (
            <Error role="alert" color="error">
              {getErrorMessage(error)}
            </Error>
          ) : null}
        </Stack>
        <Flex gap="md">
          <Tooltip label={disabledFeatMsg} disabled={!disabledFeatMsg}>
            <Box>
              <Switch
                id="database-routing-toggle"
                checked={enabled}
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

          <Stack mb="xl" gap="sm">
            <Flex justify="space-between" align="center" gap="sm">
              <Box>
                <Label htmlFor="db-routing-user-attribute">
                  {t`User attribute to match destination database slug`}{" "}
                  <Text component="span" c="error">
                    *
                  </Text>
                </Label>
                <Text c="text-secondary" mt="xs" style={{ textWrap: "pretty" }}>
                  {t`This attribute determines which destination database the person queries.`}
                </Text>
              </Box>
              <Tooltip
                label={t`This attribute determines which destination database the person can query. The value must match the slug of the destination database.`}
                maw="20rem"
                withArrow
              >
                <Select
                  data-testid="db-routing-user-attribute"
                  name="db-routing-user-attribute"
                  placeholder={t`Choose an attribute`}
                  data={userAttributeOptions}
                  disabled={!isAdmin || !!disabledFeatMsg}
                  value={userAttribute}
                  onChange={handleUserAttributeChange}
                  renderOption={renderUserAttributesForSelect}
                />
              </Tooltip>
            </Flex>
            {errMsg && <Error>{errMsg}</Error>}
          </Stack>

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
