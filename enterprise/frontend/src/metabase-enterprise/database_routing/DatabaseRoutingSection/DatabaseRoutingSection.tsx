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
  useListEnginesQuery,
  useListTransformsQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
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
import { renderUserAttributesForSelect } from "metabase-enterprise/sandboxes/utils";
import * as Urls from "metabase-enterprise/urls";
import type { Database } from "metabase-types/api";
import { isEngineKey } from "metabase-types/guards";

import { AnonymousAccessChoiceModal } from "../AnonymousAccessChoiceModal";
import { DestinationDatabasesList } from "../DestinationDatabasesList";

import { useAnonymousAccessChoice } from "./useAnonymousAccessChoice";
import { getDisabledFeatureMessage, getSelectErrorMessage } from "./utils";

export const DatabaseRoutingSection = ({
  database,
}: {
  database: Database;
}) => {
  const { data: engines = {} } = useListEnginesQuery();

  const isAdmin = useSelector(getUserIsAdmin);
  const dbSupportsRouting = database.features?.includes("database-routing");
  const engineKey = isEngineKey(database.engine) ? database.engine : undefined;
  const engine = engineKey ? engines[engineKey] : undefined;
  const dbRoutingInfo =
    engine?.["extra-info"]?.["db-routing-info"]?.text ??
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
    t`When someone views a question using data from this database, Metabase will send the queries to the destination database set by the person's user attribute. Each destination database must have identical schemas.`;
  const shouldHideSection =
    database.is_attached_dwh || database.is_sample || !dbSupportsRouting;

  const {
    enabled,
    userAttribute,
    isRoutingStored,
    error,
    anonymousAccessGranted,
    canChangeAnonymousAccess,
    isReachabilityKnown,
    hasStoppedServingAnonymousVisitors,
    openQuestion,
    cancelUndoesEnable,
    toggleRouting,
    chooseUserAttribute,
    changeAnonymousAccess,
    answerQuestion,
    cancelQuestion,
  } = useAnonymousAccessChoice(database, { skip: !!shouldHideSection });

  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(
    function expandIfEnabled() {
      if (enabled) {
        setIsExpanded(true);
      }
    },
    [enabled],
  );

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

  const disabledFeatMsg = getDisabledFeatureMessage(database, {
    hasTransforms,
  });
  const errMsg = getSelectErrorMessage({
    userAttribute,
    disabledFeatureMessage: disabledFeatMsg,
    hasNoUserAttributeOptions:
      !userAttrsReq.isLoading && userAttributeOptions.length === 0,
  });

  const handleToggle = async (nextEnabled: boolean) => {
    setIsExpanded(nextEnabled);
    await toggleRouting(nextEnabled);
  };

  const handleQuestionCancel = () => {
    if (cancelUndoesEnable) {
      setIsExpanded(false);
    }
    cancelQuestion();
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
        question={openQuestion}
        onCancel={handleQuestionCancel}
        onAnswer={answerQuestion}
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
                  onChange={chooseUserAttribute}
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
                      !isAdmin ||
                      !!disabledFeatMsg ||
                      !canChangeAnonymousAccess ||
                      // the grant cannot be decided before the panel knows what it is serving
                      !isReachabilityKnown
                    }
                    onChange={(e) =>
                      changeAnonymousAccess(e.currentTarget.checked)
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
