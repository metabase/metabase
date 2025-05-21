import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { skipToken } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { useToast } from "metabase/common/hooks";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Stack, Text } from "metabase/ui";
import {
  useListMetabotsEntitiesQuery,
  useListMetabotsQuery,
  useUpdateMetabotEntitiesMutation,
} from "metabase-enterprise/api";
import type { MetabotEntity, MetabotId } from "metabase-types/api";

import { MetabotEntitiesTable } from "./MetabotEntityTable";
import { useMetabotIdPath } from "./utils";

export function MetabotAdminPage() {
  const metabotId = useMetabotIdPath();
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

function MetabotNavPane() {
  const { data, isLoading } = useListMetabotsQuery();
  const metabotId = useMetabotIdPath();
  const dispatch = useDispatch();

  const metabots = useMemo(() => _.sortBy(data?.items ?? [], "id"), [data]);

  useEffect(() => {
    const hasMetabotId = metabots?.some((metabot) => metabot.id === metabotId);

    if (!hasMetabotId && metabots?.length) {
      dispatch(push(`/admin/metabot/${metabots[0]?.id}`));
    }
  }, [metabots, metabotId, dispatch]);

  if (isLoading || !data) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Flex direction="column" w="266px" flex="0 0 auto">
      <LeftNavPane>
        {metabots?.map((metabot) => (
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
  const [updateEntities] = useUpdateMetabotEntitiesMutation();
  const [isOpen, { open, close }] = useDisclosure(false);
  const [sendToast] = useToast();

  if (!metabotId) {
    return null;
  }
  if (isLoading || !entityList) {
    return <LoadingAndErrorWrapper loading />;
  }

  const handleAddEntity = async (
    newEntity: Pick<MetabotEntity, "model" | "id" | "name">,
  ) => {
    const newItems = [...entityList.items, newEntity].map((item) =>
      _.pick(item, "model", "id"),
    );

    const result = await updateEntities({
      id: metabotId,
      entities: newItems,
    });

    if (result.error) {
      sendToast({
        message: t`Error adding ${newEntity.name}`,
        icon: "warning",
      });
    }
    close();
  };

  const itemCount = entityList?.items?.length ?? 0;

  return (
    <Stack>
      <Flex gap="md">
        <Text fw="bold">
          {ngettext(msgid`${itemCount} item`, `${itemCount} items`, itemCount)}
        </Text>
        <Text>{t`We recommend keeping this to no more than 30.`}</Text>
      </Flex>
      <Box>
        <Button variant="filled" onClick={open}>
          {t`Add items`}
        </Button>
      </Box>
      <MetabotEntitiesTable entities={entityList.items} />
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
