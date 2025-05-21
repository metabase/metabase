import { t } from "ttag";

import { Table } from "metabase/common/components/Table";
import { useToast } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import Markdown from "metabase/core/components/Markdown";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import { Button, Flex, Icon, Stack, Text, Title, Tooltip } from "metabase/ui";
import { useDeleteMetabotEntitiesMutation } from "metabase-enterprise/api";
import type { MetabotEntity } from "metabase-types/api";

import MetabotWithStuff from "./MetabotWithStuff.svg?component";
import { useMetabotIdPath } from "./utils";

export function MetabotEntitiesTable({
  entities,
}: {
  entities: MetabotEntity[];
}) {
  const [deleteEntity] = useDeleteMetabotEntitiesMutation();
  const metabotId = useMetabotIdPath();
  const [sendToast] = useToast();

  const handleDelete = async (entity: MetabotEntity) => {
    if (metabotId) {
      const result = await deleteEntity({
        metabotId,
        entityModel: entity.model,
        entityId: entity.id,
      });

      if (result.error) {
        sendToast({
          message: t`Error removing ${entity.name}`,
          icon: "warning",
        });
      } else {
        sendToast({ message: t`Removed ${entity.name}` });
      }
    }
  };

  return (
    <Table
      columns={[
        { key: "item", name: t`Item` },
        { key: "location", name: t`Location` },
        { key: "delete", name: t`` },
      ]}
      rows={entities}
      emptyBody={<EmptyTable />}
      rowRenderer={(row) => (
        <tr key={row.id}>
          <td style={{ padding: "8px 16px" }}>
            <Link to={String(modelToUrl(row))} variant="brand">
              <Flex align="center" gap="sm">
                <Icon {...getIcon(row)} />
                <Text>{row.name}</Text>
              </Flex>
            </Link>
          </td>
          <td style={{ padding: "8px 16px" }}>
            <Link
              to={
                modelToUrl({
                  model: "collection",
                  id: row.collection_id as number,
                  name: row.collection_name,
                }) as string
              }
              variant="brand"
            >
              <Flex align="center" gap="sm">
                <Icon name="folder" />
                <Text>{row.collection_name}</Text>
              </Flex>
            </Link>
          </td>
          <td style={{ padding: "8px" }}>
            <Flex justify="end">
              <Tooltip label={t`Remove`}>
                <Button variant="subtle" onClick={() => handleDelete(row)}>
                  <Icon name="close" c="text-medium" />
                </Button>
              </Tooltip>
            </Flex>
          </td>
        </tr>
      )}
    />
  );
}

const EmptyTable = () => (
  <Stack py="6rem" gap="md" align="center">
    <MetabotWithStuff />
    <Title order={4}>{t`There's nothing here, yet`}</Title>
    <Text>
      <Markdown>
        {t`Click on the **Add items** button to add models or metrics.`}
      </Markdown>
    </Text>
  </Stack>
);
