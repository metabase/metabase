import { useState } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import { Anchor, Box, Button, Group, Icon, Stack, Text } from "metabase/ui";

import {
  getUpdateApiErrorMessage,
  getUpdateApiErrorType,
  getUpdateApiTableId,
} from "./getUpdateErrorMessage";

type ErrorUpdateToastProps = {
  error: unknown;
};

export const ErrorUpdateToast = ({ error }: ErrorUpdateToastProps) => {
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage = getUpdateApiErrorMessage(error);
  const errorType = getUpdateApiErrorType(error);
  const tableId = getUpdateApiTableId(error);

  const showPkError = errorType === "data-editing/no-pk" && tableId;
  const { data: table } = useGetTableQuery(
    { id: tableId ?? 0 },
    { skip: !showPkError },
  );

  if (showPkError) {
    const schemaId = table
      ? generateSchemaId(table.db_id, table.schema)
      : undefined;
    return (
      <Box w="18rem">
        <Text
          c="text-primary-inverse"
          fw={700}
        >{t`Editing unavailable: no PK defined`}</Text>
        <Text c="text-primary-inverse">{jt`Add a primary key in your database or set an ${(
          <Anchor
            component={Link}
            to={`/data-studio/data/database/${table?.db_id}/schema/${schemaId}/table/${table?.id}`}
            disabled={!table}
            key="entity-key-link"
            target="_blank"
          >
            {t`Entity Key`}
          </Anchor>
        )} to enable editing`}</Text>
      </Box>
    );
  }
  if (showDetails) {
    return (
      <Stack gap="0.5rem" w="30rem" maw="100%">
        <Text c="text-primary-inverse">{t`Couldn't save table changes:`}</Text>
        <Text c="text-primary-inverse" style={{ fontFamily: "monospace" }}>
          {errorMessage}
        </Text>
      </Stack>
    );
  }

  return (
    <Group gap="2.5rem" w="20rem">
      <Group gap="0.5rem">
        <Icon name="warning" c="danger" size={12} />
        <Text
          c="text-primary-inverse"
          fw={700}
        >{t`Couldn't save table changes`}</Text>
      </Group>

      <Button
        size="compact-lg"
        c="background-secondary-inverse"
        variant="filled"
        autoContrast
        radius="0.5rem"
        onClick={() => setShowDetails(true)}
      >{t`More info`}</Button>
    </Group>
  );
};
