import { useDisclosure } from "@mantine/hooks";
import { useEffect } from "react";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import { c, t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { skipToken } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { Table } from "metabase/common/components/Table";
import { useToast } from "metabase/common/hooks";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { getIcon } from "metabase/lib/icon";
import { useDispatch } from "metabase/lib/redux";
import { modelToUrl } from "metabase/lib/urls";
import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";
import {
  useAddMetabotEntitiesMutation,
  useDeleteMetabotEntitiesMutation,
  useListMetabotsEntitiesQuery,
  useListMetabotsQuery,
} from "metabase-enterprise/api";
import type { MetabotEntity, MetabotId } from "metabase-types/api";

export function MetabotAdminPage() {
  const metabotId = useMetabotIdPath();
  return (
    <Flex p="xl">
      <MetabotNavPane />
      <Stack px="xl">
        <SettingHeader
          id="configure-metabot"
          title={t`Configure Metabot`}
          // eslint-disable-next-line no-literal-metabase-strings -- admin settings
          description={t`Metabot is Metabase's AI agent. To help Metabot more easily find and focus on the data you care about most, select the models and metrics it should be able to use to create queries.`}
        />
        <SettingHeader
          id="allow-metabot"
          title={t`Items Metabot is allowed to use`}
        />
        <MetabotConfigurationPane metabotId={metabotId} />
      </Stack>
    </Flex>
  );
}

function MetabotNavPane() {
  const { data: metabots, isLoading } = useListMetabotsQuery();
  const metabotId = useMetabotIdPath();
  const dispatch = useDispatch();

  useEffect(() => {
    const hasMetabotId = metabots?.some((metabot) => metabot.id === metabotId);

    if (!hasMetabotId && metabots?.length) {
      dispatch(push(`/admin/metabot/${metabots[0]?.id}`));
    }
  }, [metabots, metabotId, dispatch]);

  if (isLoading || !metabots) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Flex direction="column" w="266px" flex="0 0 auto">
      <LeftNavPane>
        {metabots.map((metabot) => (
          <LeftNavPaneItem
            key={metabot.id}
            name={metabot.name}
            path={`/admin/metabot/${metabot.id}`}
          />
        ))}
      </LeftNavPane>
    </Flex>
  );
}

function MetabotConfigurationPane({
  metabotId,
}: {
  metabotId: MetabotId | null;
}) {
  const { data: entityList, isLoading } = useListMetabotsEntitiesQuery(
    metabotId ?? skipToken,
  );
  const [addEntities] = useAddMetabotEntitiesMutation();
  const [isOpen, { open, close }] = useDisclosure(false);
  const [sendToast] = useToast();

  if (!metabotId || isLoading || !entityList) {
    return <LoadingAndErrorWrapper loading />;
  }

  const handleAddEntity = async (
    entity: Pick<MetabotEntity, "model" | "id" | "name">,
  ) => {
    const result = await addEntities({
      id: metabotId,
      entities: [
        {
          model_id: entity.id,
          model_type: entity.model,
        },
      ],
    });

    if (result.error) {
      sendToast({ message: t`Error adding ${entity.name}`, icon: "warning" });
      close();
    }
  };

  return (
    <Stack>
      <Flex gap="md">
        <Text fw="bold">
          {c("{0} is the number of items")
            .t` ${entityList?.data?.length} items`}
        </Text>
        <Text>{t`We recommend keeping this to no more than 30.`}</Text>
      </Flex>
      <Box>
        <Button variant="filled" onClick={open}>
          {t`Add items`}
        </Button>
      </Box>
      <MetabotEntitiesTable entities={entityList.data} />
      {isOpen && (
        <QuestionPickerModal
          title={t`Select items`}
          models={["metric", "dataset"]}
          onChange={(item) =>
            handleAddEntity(
              item as Pick<MetabotEntity, "model" | "id" | "name">,
            )
          }
          onClose={close}
        />
      )}
    </Stack>
  );
}

function MetabotEntitiesTable({ entities }: { entities: MetabotEntity[] }) {
  const [deleteEntity] = useDeleteMetabotEntitiesMutation();
  const metabotId = useMetabotIdPath();

  const handleDelete = (entity: MetabotEntity) => {
    if (metabotId) {
      deleteEntity({
        metabotId,
        entityModel: entity.model,
        entityId: entity.id,
      });
    }
  };

  if (!entities.length) {
    return null;
  }

  return (
    <Table
      columns={[
        { key: "item", name: t`Item` },
        { key: "location", name: t`Location` },
        { key: "delete", name: t`` },
      ]}
      rows={entities}
      rowRenderer={(row) => (
        <tr key={row.id}>
          <td style={{ padding: "8px 16px" }}>
            <Link to={modelToUrl(row) as string} variant="brand">
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
              <Button variant="subtle" onClick={() => handleDelete(row)}>
                <Icon name="trash" />
              </Button>
            </Flex>
          </td>
        </tr>
      )}
    />
  );
}

function useMetabotIdPath() {
  const location = useLocation();
  const metabotId = Number(location?.pathname?.split("/").pop());
  return Number.isNaN(metabotId) ? null : metabotId;
}
