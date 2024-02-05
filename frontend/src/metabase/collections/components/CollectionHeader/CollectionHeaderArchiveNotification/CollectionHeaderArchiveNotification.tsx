// TODO: seems like the request isn't getting sent out again when viewing different collections
// TODO: - [ ] icons
//         - [ ] handle icons for dataset and dashboards
//         - [ ] color
// LATER TODO: handle string inputs for collection ids
// TODO: allow the user to dismiss the notification if they want to keep the items (snooze just for one collection or something)

import { useState, useEffect } from "react";
import _ from "underscore";
import Dashboard from "metabase/entities/dashboards";
import { useAsyncRetry } from "react-use";
import Questions from "metabase/entities/questions";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { CollectionsApi } from "metabase/services";
import { Flex, Text, Button, Modal } from "metabase/ui";
import {
  ArchiveAlert,
  ArchiveViewButton,
} from "./CollectionHeaderArchiveNotification.styled";
import { getItemId, getItemIds } from "./utils";
import type { Item } from "./utils";
import { CollectionHeaderArchiveNotificationTable } from "./CollectionHeaderArchiveNotificationTable";

interface CollectionHeaderArchiveNotificationProps {
  collectionId?: string | number;
}

// TODO: think though show all / show just for collection / show models
// and how that should info which props to pick

const emptyArr: Item[] = [];

export const CollectionHeaderArchiveNotification = ({
  collectionId,
}: CollectionHeaderArchiveNotificationProps) => {
  const dispatch = useDispatch();

  const isAdmin = useSelector(getUserIsAdmin);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  let { loading, value, retry } = useAsyncRetry(async () => {
    if (!isAdmin || typeof collectionId === "string") {
      return [];
    }

    const response = (await CollectionsApi.getAutoArchive({
      collectionId,
    })) as Item[];
    // TODO: remove uniq check when BE is fixed
    const items = _.uniq(response, item => getItemId(item));
    setSelectedIds(getItemIds(items));
    return items;
  });

  const items = !loading ? value ?? emptyArr : emptyArr;

  // TODO: solve user undoes archive action, should make the notification appear again

  // TODO: check if there's better utils for loading in data with different variables using useAsync hooks
  useEffect(() => {
    retry();
  // TODO: fix
  // eslint-disable react-hooks/exhaustive-deps
  }, [collectionId]);

  if (typeof collectionId === "string" || items.length === 0) {
    return null;
  }

  const handleArchive = () => {
    const itemsToArchive = items.filter(item =>
      selectedIds.has(getItemId(item)),
    );

    // FUTURE TODO: use some kind of bulk archive endpoint
    itemsToArchive.forEach(item => {
      if (item.model === "card" || item.model === "dataset") {
        dispatch(Questions.actions.setArchived({ id: item.id }, true));
      } else if (item.model === "dashboard") {
        dispatch(Dashboard.actions.setArchived({ id: item.id }, true));
      }
    });

    setTimeout(() => {
      retry();
    }, 250); // TODO: remove setTimeout and solve race condition
    setIsOpen(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSelectedIds(getItemIds(items));
  };
  const handleClose = () => setIsOpen(false);

  return (
    <>
      <ArchiveAlert icon="archive" variant="info" className="mt1">
        <Text>
          {/* TODO: how to translate values that have singular or plural nouns */}
          {`You have ${items.length} ${
            items.length === 1 ? "item" : "items"
          } that have not been used for the last 6 months.`}
          <br />
          {`Do you want to archive them?`}
        </Text>
        <ArchiveViewButton variant="filled" onClick={handleOpen}>
          View items
        </ArchiveViewButton>
      </ArchiveAlert>
      <Modal
        title="Here are the items your team hasn't used in the past 6 months"
        padding="xl"
        size="xl"
        opened={isOpen}
        onClose={handleClose}
      >
        <CollectionHeaderArchiveNotificationTable
          selectedIds={selectedIds}
          items={items}
          onSelectIdsChange={setSelectedIds}
        />
        <Flex justify="flex-end">
          <Button variant="outline" onClick={handleClose} className="mr2">
            Cancel
          </Button>
          <Button variant="filled" onClick={handleArchive}>
            Archive items
          </Button>
        </Flex>
      </Modal>
    </>
  );
};
