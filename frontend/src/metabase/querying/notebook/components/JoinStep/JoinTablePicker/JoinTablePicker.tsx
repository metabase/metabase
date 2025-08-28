import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { useDispatch } from "metabase/lib/redux";
import { onOpenColumnPickerSidebar } from "metabase/query_builder/actions";
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
  columnPicker: React.ReactNode;
  onChange: (table: Lib.Joinable) => void;
  isOpened: boolean;
  setIsOpened: (isOpened: boolean) => void;
  join?: Lib.Join; // Add join for Redux sidebar
  onQueryChange?: (query: Lib.Query) => void; // Add query change handler
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  color,
  isReadOnly,
  columnPicker,
  onChange,
  isOpened,
  setIsOpened,
  join,
  onQueryChange,
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
          <JoinTableColumnPickerWrapper
            query={query}
            stageIndex={stageIndex}
            join={join}
            onQueryChange={onQueryChange}
            columnPicker={columnPicker}
            isOpened={isOpened}
            setIsOpened={setIsOpened}
          />
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

interface JoinTableColumnPickerWrapperProps {
  query?: Lib.Query;
  stageIndex?: number;
  join?: Lib.Join;
  onQueryChange?: (query: Lib.Query) => void;
  columnPicker: React.ReactNode;
  isOpened: boolean;
  setIsOpened: (isOpened: boolean) => void;
}

function JoinTableColumnPickerWrapper({
  query,
  stageIndex,
  join,
  onQueryChange: _onQueryChange,
  columnPicker: _columnPicker,
  isOpened: _isOpened,
  setIsOpened: _setIsOpened,
}: JoinTableColumnPickerWrapperProps) {
  const dispatch = useDispatch();

  const handleOpenSidebar = () => {
    if (join && query && stageIndex !== undefined) {
      dispatch(
        onOpenColumnPickerSidebar({
          sidebarData: {
            type: "join-step",
            title: t`Pick columns`,
          },
        }),
      );
    }
  };

  return (
    <Tooltip label={t`Pick columns`}>
      <IconButtonWrapper
        className={S.ColumnPickerButton}
        style={
          {
            "--notebook-cell-container-padding": CONTAINER_PADDING,
          } as React.CSSProperties
        }
        onClick={handleOpenSidebar}
        aria-label={t`Pick columns`}
        data-testid="fields-picker"
      >
        <Icon name="notebook" />
      </IconButtonWrapper>
    </Tooltip>
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
