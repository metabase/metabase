import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon, Popover, Tooltip } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../NotebookCell";
import { CONTAINER_PADDING } from "../../NotebookCell/constants";
import { NotebookDataPicker } from "../../NotebookDataPicker";

import S from "./JoinTablePicker.module.css";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.Joinable | undefined;
  color: string;
  isReadOnly: boolean;
  columnPicker: ReactNode;
  onChange: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  color,
  isReadOnly,
  columnPicker,
  onChange,
}: JoinTablePickerProps) {
  const isDisabled = isReadOnly;

  return (
    <NotebookCellItem
      inactive={!table}
      readOnly={isReadOnly}
      disabled={isDisabled}
      color={color}
      right={
        table != null && !isReadOnly ? (
          <JoinTableColumnPicker columnPicker={columnPicker} />
        ) : null
      }
      containerStyle={CONTAINER_STYLE}
      rightContainerStyle={RIGHT_CONTAINER_STYLE}
      aria-label={t`Right table`}
    >
      <NotebookDataPicker
        title={t`Pick data to join`}
        query={query}
        stageIndex={stageIndex}
        table={table}
        placeholder={t`Pick data…`}
        canChangeDatabase={false}
        hasMetrics={false}
        isDisabled={isDisabled}
        onChange={onChange}
      />
    </NotebookCellItem>
  );
}

interface JoinTableColumnPickerProps {
  columnPicker: ReactNode;
}

function JoinTableColumnPicker({ columnPicker }: JoinTableColumnPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Tooltip label={t`Pick columns`}>
          <IconButtonWrapper
            className={S.ColumnPickerButton}
            style={
              {
                "--notebook-cell-container-padding": CONTAINER_PADDING,
              } as CSSProperties
            }
            onClick={() => setIsOpened(!isOpened)}
            aria-label={t`Pick columns`}
            data-testid="fields-picker"
          >
            <Icon name="chevrondown" />
          </IconButtonWrapper>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>{columnPicker}</Popover.Dropdown>
    </Popover>
  );
}

const CONTAINER_STYLE = {
  padding: 0,
};

const RIGHT_CONTAINER_STYLE = {
  width: 37,
  height: "100%",
  padding: 0,
};
