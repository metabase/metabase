import type { CSSProperties } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { Icon, Tooltip } from "metabase/ui";
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
  onOpenColumnPicker?: () => void;
  onChange: (table: Lib.Joinable) => void;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  color,
  isReadOnly,
  onOpenColumnPicker,
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
        table != null && !isReadOnly && onOpenColumnPicker ? (
          <Tooltip label={t`Pick columns`}>
            <IconButtonWrapper
              className={S.ColumnPickerButton}
              style={
                {
                  "--notebook-cell-container-padding": CONTAINER_PADDING,
                } as CSSProperties
              }
              onClick={onOpenColumnPicker}
              aria-label={t`Pick columns`}
              data-testid="fields-picker"
            >
              <Icon name="chevrondown" />
            </IconButtonWrapper>
          </Tooltip>
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



const CONTAINER_STYLE = {
  padding: 0,
};

const RIGHT_CONTAINER_STYLE = {
  width: 37,
  height: "100%",
  padding: 0,
};
