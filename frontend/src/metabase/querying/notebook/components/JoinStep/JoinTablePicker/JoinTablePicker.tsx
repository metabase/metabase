import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { METAKEY } from "metabase/lib/browser";
import type { ColorName } from "metabase/lib/colors/types";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbedding } from "metabase/selectors/embed";
import { Box, Icon, Popover, Tooltip } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../NotebookCell";
import { CONTAINER_PADDING } from "../../NotebookCell/constants";
import { NotebookDataPicker } from "../../NotebookDataPicker";
import { DataPickerTarget } from "../../NotebookDataPicker/DataPickerTarget";

import S from "./JoinTablePicker.module.css";

interface JoinTablePickerProps {
  query: Lib.Query;
  stageIndex: number;
  table: Lib.Joinable | undefined;
  color: ColorName;
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
  const [isOpened, setIsOpened] = useState(!table);
  const isEmbedding = useSelector(getIsEmbedding);

  return (
    <Box aria-label={t`Right table`}>
      {isOpened || !table || isEmbedding ? (
        <NotebookDataPicker
          title={t`Pick data to join`}
          query={query}
          stageIndex={stageIndex}
          table={table}
          placeholder={t`Pick data…`}
          isOpened={isOpened}
          setIsOpened={setIsOpened}
          canChangeDatabase={false}
          hasMetrics={false}
          isDisabled={isReadOnly}
          onChange={onChange}
          columnPicker={
            table != null && !isReadOnly ? (
              <JoinTableColumnPicker columnPicker={columnPicker} />
            ) : null
          }
        />
      ) : (
        <NotebookCellItem
          inactive={!table}
          readOnly={isReadOnly}
          disabled={isReadOnly}
          color={color}
          right={
            table != null && !isReadOnly ? (
              <JoinTableColumnPicker columnPicker={columnPicker} />
            ) : null
          }
          containerStyle={CONTAINER_STYLE}
          rightContainerStyle={RIGHT_CONTAINER_STYLE}
        >
          <Tooltip
            label={t`${METAKEY}+click to open in new tab`}
            hidden={!table || isReadOnly}
            events={{ hover: true, focus: false, touch: false }}
          >
            <DataPickerTarget
              table={table}
              query={query}
              setIsOpened={setIsOpened}
              stageIndex={stageIndex}
              isDisabled={isReadOnly}
            />
          </Tooltip>
        </NotebookCellItem>
      )}
    </Box>
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
  padding: 0,
};
