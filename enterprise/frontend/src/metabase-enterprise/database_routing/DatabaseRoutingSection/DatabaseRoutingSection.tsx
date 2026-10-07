import { useEffect, useState } from "react";
import { t } from "ttag";

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

import { AnonymousAccessChoiceModal } from "../AnonymousAccessChoiceModal";
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

  const isRoutingStored = hasDbRoutingEnabled(database);
  const [tempEnabled, setTempEnabled] = useState(false);
  const enabled = tempEnabled || isRoutingStored;

  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(
    function expandIfEnabled() {
      if (enabled) {
        setIsExpanded(true);
      }
    },
    [enabled],
  );

  // Held until a user attribute carries it to the server in the same request.
  const [pendingAnonymousAccess, setPendingAnonymousAccess] = useState<
    boolean | undefined
  >(undefined);
  // The attribute waiting on an answer, when the admin reached the select without being asked.
  const [attributeAwaitingAnswer, setAttributeAwaitingAnswer] = useState<
    string | undefined
  >(undefined);
  // The prop lags a successful store by a refetch, so remember what went to the server.
  const [sentAttribute, setSentAttribute] = useState<string | undefined>(
    undefined,
  );
  const routerAttribute = userAttribute ?? sentAttribute;
  // Once routing is stored the grant lives on the server, so the held answer has done its work.
  const pendingGrant = isRoutingStored ? undefined : pendingAnonymousAccess;
  const anonymousAccessGranted =
    pendingGrant ?? !!database.router_anonymous_access_granted;
  const canChangeAnonymousAccess =
    isRoutingStored || pendingGrant !== undefined;

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

  // usage info is admin-only, and the fact is only there to inform the admin making the decision
  const { data: usageInfo } = useGetDatabaseUsageInfoQuery(
    shouldHideSection || !isAdmin ? skipToken : database.id,
  );

  const anonymouslyReachable = !!usageInfo?.anonymously_reachable;

  // A just-toggled database was asked instead, and a granted router still serves them.
  const hasStoppedServingAnonymousVisitors =
    isRoutingStored && !anonymousAccessGranted && anonymouslyReachable;

  // The invariant: a router is never stored without the grant decision attached.
  const mustAnswerBeforeStoring =
    !isRoutingStored && anonymouslyReachable && pendingGrant === undefined;
  // Derived, so it survives the toggle beating the reachability fact. The chevron only discloses.
  const mustChooseAnonymousAccess =
    mustAnswerBeforeStoring &&
    (tempEnabled || attributeAwaitingAnswer !== undefined);

  const disabledFeatMsg = getDisabledFeatureMessage(database, {
    hasTransforms,
  });
  const errMsg = getSelectErrorMessage({
    userAttribute,
    disabledFeatureMessage: disabledFeatMsg,
    hasNoUserAttributeOptions:
      !userAttrsReq.isLoading && userAttributeOptions.length === 0,
  });

  const storeRouter = async (
    attribute: string,
    granted: boolean | undefined,
  ) => {
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: attribute,
      // An omitted grant leaves the stored one alone, so only a first enable carries the answer.
      ...(granted !== undefined && { anonymous_access_granted: granted }),
    });
    // the trigger resolves rather than rejects on failure; the error is rendered inline
    if ("error" in result) {
      return;
    }
    setSentAttribute(attribute);
    sendToast({
      message: isRoutingStored
        ? t`Database routing updated`
        : t`Database routing enabled`,
    });
  };

  const handleUserAttributeChange = async (attribute: string) => {
    if (mustAnswerBeforeStoring) {
      setAttributeAwaitingAnswer(attribute);
      return;
    }
    await storeRouter(attribute, pendingGrant);
  };

  const handleAnonymousAccessChange = async (granted: boolean) => {
    // With no stored attribute there is nothing to store the grant against, so it keeps waiting.
    if (!routerAttribute) {
      setPendingAnonymousAccess(granted);
      return;
    }
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: routerAttribute,
      anonymous_access_granted: granted,
    });
    // the trigger resolves rather than rejects on failure; the error is rendered inline
    if ("error" in result) {
      return;
    }
    // What the server just accepted outranks the prop until the refetch lands.
    setPendingAnonymousAccess(granted);
    sendToast({
      message: granted
        ? t`Anonymous access allowed`
        : t`Anonymous access disallowed`,
    });
  };

  // Nothing reaches the server until an attribute does, so abandoning only drops local state.
  const discardPendingRouting = () => {
    setTempEnabled(false);
    setPendingAnonymousAccess(undefined);
    setAttributeAwaitingAnswer(undefined);
    setSentAttribute(undefined);
  };

  const handleToggle = async (enabled: boolean) => {
    setIsExpanded(enabled);
    if (enabled) {
      setTempEnabled(true);
      return;
    }
    discardPendingRouting();
    if (!isRoutingStored) {
      return;
    }
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: null,
    });
    if (!("error" in result)) {
      sendToast({ message: t`Database routing disabled` });
    }
  };

  const handleChoiceAnswer = async (granted: boolean) => {
    setPendingAnonymousAccess(granted);
    if (attributeAwaitingAnswer === undefined) {
      return;
    }
    setAttributeAwaitingAnswer(undefined);
    await storeRouter(attributeAwaitingAnswer, granted);
  };

  const handleChoiceCancel = () => {
    // The chevron's disclosure is the admin's own, so only a toggled-on section collapses.
    if (tempEnabled) {
      setIsExpanded(false);
    }
    discardPendingRouting();
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
      <AnonymousAccessChoiceModal
        opened={mustChooseAnonymousAccess}
        onCancel={handleChoiceCancel}
        onAnswer={handleChoiceAnswer}
      />
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

          {hasStoppedServingAnonymousVisitors && (
            <Alert
              size="compact"
              variant="light"
              color="warning"
              icon={<Icon name="warning" />}
              title={t`This database has stopped serving anonymous visitors`}
              mb="lg"
            >
              {t`To start serving them again, allow anonymous access below.`}
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
                disabled={canChangeAnonymousAccess}
                withArrow
              >
                <Box>
                  <Switch
                    id="db-routing-anonymous-access"
                    checked={anonymousAccessGranted}
                    disabled={
                      !isAdmin || !!disabledFeatMsg || !canChangeAnonymousAccess
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
                {isRoutingStored ? (
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
