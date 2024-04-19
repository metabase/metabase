import { t } from "ttag";

import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Icon, Paper, Text } from "metabase/ui";
import type { CollectionId, DashboardId, CardId } from "metabase-types/api";

type CollectionArchiveBannerProps =
  | { entity: "collection"; entityId: CollectionId }
  | { entity: "question"; entityId: CardId }
  | { entity: "dashboard"; entityId: DashboardId }
  | { entity: "model"; entityId: number };

const entityMap: Record<CollectionArchiveBannerProps["entity"], any> = {
  collection: Collections,
  dashboard: Dashboards,
  model: Questions,
  question: Questions,
};

export const ArchivedEntityBanner = ({
  entity,
  entityId,
}: CollectionArchiveBannerProps) => {
  const dispatch = useDispatch();

  const Entity = entityMap[entity];

  // TODO: use some other non-deprecated solution...
  const handleUnarchive = () => {
    dispatch(Entity.actions.setArchived({ id: entityId }, false));
  };

  // TODO: use some other non-deprecated solution...
  const handleDeletePermanently = () => {
    dispatch(Entity.actions.delete({ id: entityId }));
  };

  return (
    <Paper
      px="1.5rem"
      py=".75rem"
      bg="error"
      shadow="0"
      radius="0"
      role="complementary"
      w="100%"
    >
      <Flex justify="space-between">
        <Flex align="center">
          {/* TODO: add trash full icon */}
          <Icon
            color="white"
            name="trash"
            style={{ marginInlineEnd: "1rem" }}
          />
          <Text color="white" size="md" lh="1rem">
            {t`This ${entity} is in the trash. `}
          </Text>
        </Flex>
        <Flex gap="md">
          <Button
            compact
            variant="outline"
            color="white"
            onClick={handleUnarchive}
          >
            <Flex align="center">
              <Icon
                size={12}
                name="revert"
                style={{ marginInlineEnd: ".25rem" }}
              />{" "}
              {t`Restore`}
            </Flex>
          </Button>
          <Button
            compact
            variant="outline"
            color="white"
            onClick={handleDeletePermanently}
          >
            <Flex align="center">
              <Icon
                size={12}
                name="trash"
                style={{ marginInlineEnd: ".25rem" }}
              />{" "}
              {t`Delete permanently`}
            </Flex>
          </Button>
        </Flex>
      </Flex>
    </Paper>
  );
};
