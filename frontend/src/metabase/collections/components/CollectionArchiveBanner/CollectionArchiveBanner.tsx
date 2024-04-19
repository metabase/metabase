import { t } from "ttag";

import Collections from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Icon, Paper, Text } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

export const CollectionArchiveBanner = ({
  collectionId,
}: {
  collectionId: CollectionId;
}) => {
  const dispatch = useDispatch();

  // TODO: use some other non-deprecated solution...
  const handleUnarchive = () => {
    dispatch(Collections.actions.setArchived({ id: collectionId }, false));
  };

  // TODO: use some other non-deprecated solution...
  const handleDeletePermanently = () => {
    dispatch(Collections.actions.delete({ id: collectionId }));
  };

  return (
    <Paper
      mb="-0.5rem"
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
            {t`This collection is in the trash. `}
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
