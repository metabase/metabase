import { useDisclosure } from "@mantine/hooks";
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
  useListDatabasesQuery,
  useListEnginesQuery,
  useListTransformsQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
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
  SegmentedControl,
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
import type { Database, DatabaseRouterMode } from "metabase-types/api";
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

  const mode = database.router_mode ?? "external";
  const otherMode = mode === "internal" ? "external" : "internal";
  const [isModeModalOpen, modeModal] = useDisclosure(false);

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

  const destinationDbsReq = useListDatabasesQuery(
    hasDbRoutingEnabled(database)
      ? { router_database_id: database.id }
      : skipToken,
  );
  const destinationCount = destinationDbsReq.data?.data.length ?? 0;

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

  const handleUserAttributeChange = async (attribute: string) => {
    await updateRouterDatabase({ id: database.id, user_attribute: attribute });

    if (!hasDbRoutingEnabled(database)) {
      sendToast({ message: t`Database routing enabled` });
    } else {
      sendToast({ message: t`Database routing updated` });
    }
  };

  const updateMode = async (newMode: DatabaseRouterMode) => {
    await updateRouterDatabase({
      id: database.id,
      user_attribute: userAttribute ?? null,
      mode: newMode,
    });
    sendToast({ message: t`Database routing updated` });
  };

  const handleModeChange = (newMode: DatabaseRouterMode) => {
    if (destinationCount > 0) {
      modeModal.open();
    } else {
      updateMode(newMode);
    }
  };

  const handleConfirmModeChange = async () => {
    modeModal.close();
    await updateMode(otherMode);
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

          {hasDbRoutingEnabled(database) && (
            <Alert
              size="compact"
              variant="light"
              icon={<Icon name="info" />}
              mb="lg"
            >
              {t`In guest embeds, database queries will always be routed to the router database.`}
            </Alert>
          )}
          <Flex justify="space-between" align="center" gap="sm" mb="xl">
            <Box>
              <Label htmlFor="db-routing-mode">
                {t`Where are the destination databases?`}
              </Label>
              <Text c="text-secondary" mt="xxs" style={{ textWrap: "pretty" }}>
                {mode === "internal"
                  ? t`Every destination uses this database’s server, and only adds its own credentials.`
                  : t`Every destination has its own full connection details, so it can live on any server.`}
              </Text>
            </Box>
            <SegmentedControl<DatabaseRouterMode>
              id="db-routing-mode"
              data-testid="db-routing-mode"
              flex="none"
              value={mode}
              disabled={
                !isAdmin || !!disabledFeatMsg || !hasDbRoutingEnabled(database)
              }
              data={[
                { value: "internal", label: t`Same server` },
                { value: "external", label: t`Different servers` },
              ]}
              onChange={handleModeChange}
            />
          </Flex>
          <ConfirmModal
            opened={isModeModalOpen}
            title={t`Delete all destination databases?`}
            message={ngettext(
              msgid`Changing where destination databases are will delete the ${destinationCount} destination database. You'll need to add it again.`,
              `Changing where destination databases are will delete all ${destinationCount} destination databases. You'll need to add them again.`,
              destinationCount,
            )}
            confirmButtonText={t`Delete and change`}
            onConfirm={handleConfirmModeChange}
            onClose={modeModal.close}
          />
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
