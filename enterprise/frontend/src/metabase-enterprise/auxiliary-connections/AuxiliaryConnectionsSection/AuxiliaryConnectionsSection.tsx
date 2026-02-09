import { type ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { hasAuxiliaryConnectionsEnabled } from "metabase/admin/databases/utils";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Flex,
  Icon,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { useDeleteAuxiliaryConnectionMutation } from "metabase-enterprise/api/auxilary-connections";
import type { Database } from "metabase-types/api";

import { AuxiliaryConnectionEditor } from "./AuxiliaryConnectionEditor";
import { Label } from "./Label";
import { ALL_CONNECTION_TYPES, READ_WRITE_DATA } from "./types";

export function AuxiliaryConnectionsSection({
  database,
}: {
  database: Database;
}) {
  const [localEnabled, setLocalEnabled] = useState(false);
  const enabled =
    localEnabled ||
    hasAuxiliaryConnectionsEnabled(database, ALL_CONNECTION_TYPES);

  const [sendToast] = useToast();
  const [deleteAuxiliaryConnection] = useDeleteAuxiliaryConnectionMutation();

  const isAdmin = useSelector(getUserIsAdmin);

  const [isExpanded, setIsExpanded] = useState(enabled);

  const handleToggleSection = useCallback(function () {
    setIsExpanded((expanded) => !expanded);
  }, []);

  const disableAuxiliaryConnections = useCallback(async () => {
    await Promise.all(
      ALL_CONNECTION_TYPES.map((type) =>
        deleteAuxiliaryConnection({ id: database.id, type }).unwrap(),
      ),
    );
  }, [database.id, deleteAuxiliaryConnection]);

  const handleToggle = useCallback(
    async function (evt: ChangeEvent<HTMLInputElement>) {
      setLocalEnabled(evt.target.checked);
      setIsExpanded(evt.target.checked);

      if (!evt.target.checked) {
        try {
          await disableAuxiliaryConnections();
          sendToast({ message: t`Auxiliary connections disabled` });
        } catch (error) {
          sendToast({
            type: "error",
            icon: "warning",
            toastColor: "error",
            message: t`Something went wrong`,
          });
        }
      }
    },
    [disableAuxiliaryConnections, sendToast],
  );

  return (
    <DatabaseInfoSection
      name={t`Auxiliary connections`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      description={t`Provide connection details with elevated privileges that will be used by Metabase to run certain tasks like running transforms. Users will not be able to see or use these connections.`}
      data-testid="connection-routing-section"
    >
      <Flex justify="space-between" align="center">
        <Stack>
          <Label htmlFor="auxiliary-connections-toggle">
            <Text lh="lg">{t`Enable auxiliary connections`}</Text>
          </Label>
        </Stack>
        <Flex gap="md">
          <Box>
            <Switch
              id="auxiliary-connections-toggle"
              checked={enabled}
              disabled={!isAdmin}
              onChange={handleToggle}
            />
          </Box>
          <UnstyledButton onClick={handleToggleSection} px="xs">
            <Icon name={isExpanded ? "chevronup" : "chevrondown"} />
          </UnstyledButton>
        </Flex>
      </Flex>
      {isExpanded && (
        <>
          <DatabaseInfoSectionDivider />

          <AuxiliaryConnectionEditor
            database={database}
            type={READ_WRITE_DATA}
            title={t`Read/write data`}
            description={t`This connection will be used to run transforms and queries that modify data.`}
          />
        </>
      )}
    </DatabaseInfoSection>
  );
}
