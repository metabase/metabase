import { useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { EntityPickerModal } from "metabase/common/components/EntityPicker/components/EntityPickerModal/EntityPickerModal";
import {
  TablePicker,
  type TablePickerStatePath,
} from "metabase/common/components/Pickers/TablePicker";
import { Box } from "metabase/ui";

interface PublishTableModalProps {
  opened: boolean;
  onClose: () => void;
}

export function PublishTableModal({ opened, onClose }: PublishTableModalProps) {
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();

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
      onItemSelect={noop}
      onClose={onClose}
      onConfirm={() => {
        // TODO: Publish table
        onClose();
      }}
      selectedItem={null}
    />
  );
}
