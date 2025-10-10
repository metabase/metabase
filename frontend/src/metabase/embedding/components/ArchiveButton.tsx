import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { canArchiveItem } from "metabase/collections/utils";
import { Button, Icon, Tooltip } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import S from "./ArchiveButton.module.css";

interface ArchiveButtonProps {
  item: CollectionItem;
}
export function ArchiveButton({ item }: ArchiveButtonProps) {
  const { data: collection } = useGetCollectionQuery({
    id: item.collection_id ?? "root",
  });
  const canArchive = collection ? canArchiveItem(item, collection) : false;

  if (!canArchive) {
    return null;
  }
  return (
    <Tooltip label={t`Move to trash`}>
      <Button
        leftSection={<Icon name="archive" className={S.archiveIcon} />}
        variant="inverse"
        py="sm"
        px="md"
      />
    </Tooltip>
  );
}
