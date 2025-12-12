import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { EntityPickerModal } from "metabase/common/components/EntityPicker/components/EntityPickerModal/EntityPickerModal";
import {
  TablePicker,
  type TablePickerItem,
  type TablePickerStatePath,
} from "metabase/common/components/Pickers/TablePicker";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks/useMetadataToasts";
import { Box } from "metabase/ui";
import { usePublishTablesMutation } from "metabase-enterprise/api/table";
import { trackDataStudioTablePublished } from "metabase-enterprise/data-studio/analytics";
import { Urls } from "metabase-enterprise/urls";

interface PublishTableModalProps {
  opened: boolean;
  onClose: () => void;
}

export function PublishTableModal({ opened, onClose }: PublishTableModalProps) {
  const dispatch = useDispatch();
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();
  const { sendSuccessToast } = useMetadataToasts();
  const [publishTables] = usePublishTablesMutation();
  const [item, setItem] = useState<TablePickerItem | null>(null);

  const onConfirm = async () => {
    if (!item) {
      return;
    }
    await publishTables({ table_ids: [item.id] });
    onClose();
    sendSuccessToast(
      t`Published`,
      () => dispatch(push(Urls.dataStudioTable(item.id))),
      t`Go to ${item.name}`,
    );
    trackDataStudioTablePublished(item.id);
  };

  if (!opened) {
    return null;
  }

  return (
    <EntityPickerModal
      title={t`Select a table to publish`}
      searchModels={["table"]}
      canSelectItem
      options={{
        hasRecents: false,
        hasConfirmButtons: true,
        confirmButtonText: t`Publish`,
      }}
      tabs={[
        {
          id: "tables-tab",
          displayName: t`Tables`,
          models: ["table"],
          folderModels: ["database", "schema"],
          icon: "table",
          render: ({ onItemSelect }) => (
            <Box h="100%" style={{ overflow: "auto" }}>
              <TablePicker
                path={tablesPath}
                value={undefined}
                onItemSelect={onItemSelect}
                onPathChange={setTablesPath}
                shouldDisableItem={(item) =>
                  item.model === "table" && !!item.is_published
                }
              />
            </Box>
          ),
        },
      ]}
      onItemSelect={setItem}
      onClose={onClose}
      onConfirm={onConfirm}
      selectedItem={item}
    />
  );
}
