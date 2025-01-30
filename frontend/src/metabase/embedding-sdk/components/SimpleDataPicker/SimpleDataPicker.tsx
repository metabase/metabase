import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { isModel } from "metabase/browse/models/utils";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Popover } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

import { SimpleDataPickerView } from "./SimpleDataPickerView";

interface SimpleDataPickerProps {
  selectedEntity?: TableId;
  isInitiallyOpen: boolean;
  triggerElement: ReactNode;
  setSourceTableFn: (tableId: TableId) => void;
}

export function SimpleDataPicker({
  selectedEntity,
  isInitiallyOpen,
  setSourceTableFn,
  triggerElement,
}: SimpleDataPickerProps) {
  const [isDataPickerOpened, { toggle, close }] =
    useDisclosure(isInitiallyOpen);
  const { data, isLoading, error } = useSearchQuery({
    models: ["dataset", "table"],
  });

  const options = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.data.map(entity => {
      return {
        ...entity,
        id: isModel(entity) ? getQuestionVirtualTableId(entity.id) : entity.id,
      };
    });
  }, [data]);

  return (
    <Popover
      opened={isDataPickerOpened}
      position="bottom-start"
      onClose={close}
    >
      <Popover.Target>
        <Box onClick={toggle}>{triggerElement}</Box>
      </Popover.Target>
      <Popover.Dropdown>
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
          <SimpleDataPickerView
            selectedEntity={selectedEntity}
            onClick={setSourceTableFn}
            options={options}
          />
        </DelayedLoadingAndErrorWrapper>
      </Popover.Dropdown>
    </Popover>
  );
}
