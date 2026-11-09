import { Fragment } from "react";
import { t } from "ttag";

import { Link } from "metabase/router";
import {
  Anchor,
  Box,
  Divider,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
} from "metabase/ui";
import type { RemoteSyncEntity } from "metabase-types/api";

import {
  getEntityUrl,
  getModelIcon,
  getStatusColor,
  getStatusIcon,
  groupChanges,
} from "./utils";

type ChangesListProps = {
  entities: RemoteSyncEntity[];
};

export const ChangesList = ({ entities }: ChangesListProps) => (
  <Stack gap="sm">
    <Text fw="bold">{t`Changes`}</Text>
    <Paper withBorder radius="sm" mah="20rem" style={{ overflowY: "auto" }}>
      {groupChanges(entities).map((group, index) => (
        <Fragment key={group.key}>
          {index > 0 && <Divider />}
          <Box p="md">
            <Group
              p="sm"
              gap="sm"
              mb="sm"
              bg="background_page-secondary"
              bdrs="sm"
              wrap="nowrap"
            >
              <Icon name={group.icon} c="text-secondary" />
              <Text fw="bold" c="text-secondary" truncate>
                {group.path.join(" / ")}
              </Text>
            </Group>
            <Stack
              gap="sm"
              ml="lg"
              pl="sm"
              style={{ borderLeft: "2px solid var(--mb-color-border-neutral)" }}
            >
              {group.entities.map((entity, entityIndex) => (
                <Group
                  key={`${entity.model}-${entity.id}-${entityIndex}`}
                  gap="sm"
                  wrap="nowrap"
                >
                  <Icon name={getModelIcon(entity.model)} c="text-secondary" />
                  <EntityName entity={entity} />
                  <Icon
                    name={getStatusIcon(entity.sync_status)}
                    c={getStatusColor(entity.sync_status)}
                    ml="auto"
                    aria-label={entity.sync_status}
                  />
                </Group>
              ))}
            </Stack>
          </Box>
        </Fragment>
      ))}
    </Paper>
  </Stack>
);

type EntityNameProps = {
  entity: RemoteSyncEntity;
};

const EntityName = ({ entity }: EntityNameProps) => {
  const url = getEntityUrl(entity);

  return url != null ? (
    <Anchor component={Link} to={url} target="_blank" truncate>
      {entity.name}
    </Anchor>
  ) : (
    <Text truncate>{entity.name}</Text>
  );
};
