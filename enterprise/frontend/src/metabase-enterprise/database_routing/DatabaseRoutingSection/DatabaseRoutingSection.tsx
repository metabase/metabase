import { useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import {
  skipToken,
  useGetDatabaseUsageInfoQuery,
  useListEnginesQuery,
  useListTransformsQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks/use-toast";
import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import {
  Alert,
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

  const { data: engines = {} } = useListEnginesQuery();

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

  const anonymousAccessGranted = !!database.router_anonymous_access_granted;

  const [updateRouterDatabase, { error }] = useUpdateRouterDatabaseMutation();
  const userAttrsReq = useListUserAttributesQuery(
    shouldHideSection ? skipToken : undefined,
  );
  const userAttributeOptions =
    userAttrsReq.data ?? (userAttribute ? [userAttribute] : []);

  const transformsQuery = useListTransformsQuery(
    shouldHideSection ? skipToken : { "database-id": database.id },
  );
  const transforms = transformsQuery.data ?? [];
  const hasTransforms = transforms.length > 0;

  // usage info is admin-only, and the count is only there to inform the admin making the decision
  const usageInfoQuery = useGetDatabaseUsageInfoQuery(
    shouldHideSection || !isAdmin ? skipToken : database.id,
  );
  const publicQuestionCount = usageInfoQuery.data?.public_link ?? 0;

  const disabledFeatMsg = getDisabledFeatureMessage(database, {
    hasTransforms,
  });
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

  const handleAnonymousAccessChange = async (granted: boolean) => {
    if (!userAttribute) {
      return;
    }
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: userAttribute,
      anonymous_access_granted: granted,
    });
    // the trigger resolves rather than rejects on failure; the error is rendered inline
    if ("error" in result) {
      return;
    }
    sendToast({
      message: granted
        ? t`Anonymous access allowed`
        : t`Anonymous access disallowed`,
    });
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
            <Error role="alert" color="feedback-negative">
              {getErrorMessage(error)}
            </Error>
          ) : null}
        </Stack>
        <Flex gap="lg">
          <Tooltip label={disabledFeatMsg} disabled={!disabledFeatMsg}>
            <Box data-testid="database-routing-toggle-wrapper">
              <Switch
                id="database-routing-toggle"
                checked={enabled}
                disabled={!!disabledFeatMsg || !isAdmin}
                onChange={(e) => handleToggle(e.currentTarget.checked)}
              />
            </Box>
          </Tooltip>
          {disabledFeatMsg == null && (
            <UnstyledButton onClick={() => setIsExpanded(!isExpanded)} px="xxs">
              <Icon name={isExpanded ? "chevronup" : "chevrondown"} />
            </UnstyledButton>
          )}
        </Flex>
      </Flex>

      {disabledFeatMsg != null && (
        <>
          <DatabaseInfoSectionDivider />
          <Alert
            size="compact"
            variant="light"
            icon={<Icon name="info" />}
            mb="lg"
          >
            {disabledFeatMsg}
          </Alert>
        </>
      )}

      {isExpanded && (
        <>
          <DatabaseInfoSectionDivider />

          {enabled && (
            <Alert
              size="compact"
              variant="light"
              icon={<Icon name="info" />}
              mb="lg"
            >
              <Stack gap="xs">
                <Text
                  inherit
                >{t`In guest embeds and public links, database queries will always be routed to the router database.`}</Text>
                <Text inherit>
                  {publicQuestionCount > 0
                    ? ngettext(
                        msgid`This affects ${publicQuestionCount} public question on this database, and any public dashboard that uses it.`,
                        `This affects ${publicQuestionCount} public questions on this database, and any public dashboard that uses it.`,
                        publicQuestionCount,
                      )
                    : t`This affects any public dashboard that uses this database.`}
                </Text>
              </Stack>
            </Alert>
          )}
          <Stack mb="xxl" gap="sm">
            <Flex justify="space-between" align="center" gap="sm">
              <Box>
                <Label htmlFor="db-routing-user-attribute">
                  {t`User attribute to match destination database slug`}{" "}
                  <Text component="span" c="feedback-negative">
                    *
                  </Text>
                </Label>
                <Text
                  c="text-secondary"
                  mt="xxs"
                  style={{ textWrap: "pretty" }}
                >
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

          <Stack mb="xxl" gap="sm">
            <Flex justify="space-between" align="center" gap="sm">
              <Box>
                <Label htmlFor="db-routing-anonymous-access">
                  {t`Allow anonymous access`}
                </Label>
                <Text
                  c="text-secondary"
                  mt="xxs"
                  style={{ textWrap: "pretty" }}
                >
                  {t`Anonymous visitors have no user attribute, so they can't be routed to a destination database. Allow their queries to run against this database instead.`}
                </Text>
              </Box>
              <Tooltip
                label={t`Please choose a user attribute first`}
                disabled={hasDbRoutingEnabled(database)}
                withArrow
              >
                <Box>
                  <Switch
                    id="db-routing-anonymous-access"
                    checked={anonymousAccessGranted}
                    disabled={
                      !isAdmin ||
                      !!disabledFeatMsg ||
                      !hasDbRoutingEnabled(database)
                    }
                    onChange={(e) =>
                      handleAnonymousAccessChange(e.currentTarget.checked)
                    }
                  />
                </Box>
              </Tooltip>
            </Flex>
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
