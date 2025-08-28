import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { useDispatch } from "metabase/lib/redux";
import { onOpenColumnPickerSidebar } from "metabase/query_builder/actions";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

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
  onChange: (table: Lib.Joinable) => void;
  join?: Lib.Join;
}

export function JoinTablePicker({
  query,
  stageIndex,
  table,
  color,
  isReadOnly,
  onChange,
  join,
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
}

function JoinTableColumnPickerWrapper({
  query,
  stageIndex,
  join,
}: JoinTableColumnPickerWrapperProps) {
  const dispatch = useDispatch();

  const handleOpenSidebar = () => {
    if (join && query && stageIndex !== undefined) {
      // Find the index of this specific join in the stage
      const joins = Lib.joins(query, stageIndex);
      const joinIndex = joins.findIndex((j) => j === join);

      dispatch(
        onOpenColumnPickerSidebar({
          sidebarData: {
            type: "join-step",
            title: t`Pick columns`,
            stageIndex,
            joinIndex,
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
