import { type CSSProperties, useMemo } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { NotebookCell, NotebookCellItem } from "../NotebookCell";
import { CONTAINER_PADDING } from "../NotebookCell/constants";
import { NotebookDataPicker } from "../NotebookDataPicker";

import S from "./DataStep.module.css";

export const DataStep = ({
  query,
  step,
  readOnly = false,
  color,
  updateQuery,
  dataPickerOptions,
}: NotebookStepProps) => {
  const { question, stageIndex } = step;
  const dispatch = useDispatch();
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId
    ? (Lib.tableOrCardMetadata(query, tableId) ?? undefined)
    : undefined;
  const isMetric = question.type() === "metric";

  const isRaw = useMemo(() => {
    return (
      Lib.aggregations(query, stageIndex).length === 0 &&
      Lib.breakouts(query, stageIndex).length === 0
    );
  }, [query, stageIndex]);

  const canSelectTableColumns = table && isRaw && !readOnly;

  const handleTableChange = async (
    table: Lib.TableMetadata | Lib.CardMetadata,
    metadataProvider: Lib.MetadataProvider,
  ) => {
    const newQuery = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
    const newAggregations = Lib.aggregations(newQuery, stageIndex);
    if (isMetric && newAggregations.length === 0) {
      await updateQuery(Lib.aggregateByCount(newQuery, stageIndex));
    } else {
      await updateQuery(newQuery);
    }
  };

  const handleOpenColumnPicker = () => {
    dispatch(
      setUIControls({
        isShowingColumnPickerSidebar: true,
        columnPickerSidebarData: {
          type: "data-step",
          title: t`Pick columns`,
        },
      }),
    );
  };

  return (
    <>
      <NotebookCell color={color}>
        <NotebookCellItem
          color={color}
          inactive={!table}
          right={
            canSelectTableColumns && (
              <Tooltip label={t`Pick columns`}>
                <IconButtonWrapper
                  className={S.DataStepIconButton}
                  style={
                    {
                      "--notebook-cell-container-padding": CONTAINER_PADDING,
                    } as CSSProperties
                  }
                  aria-label={t`Pick columns`}
                  data-testid="fields-picker"
                  onClick={handleOpenColumnPicker}
                >
                  <Icon name="notebook" />
                </IconButtonWrapper>
              </Tooltip>
            )
          }
          containerStyle={{ padding: 0 }}
          rightContainerStyle={{ width: 37, padding: 0 }}
          data-testid="data-step-cell"
        >
          <NotebookDataPicker
            query={query}
            stageIndex={stageIndex}
            table={table}
            title={t`Pick your starting data`}
            canChangeDatabase
            hasMetrics
            isDisabled={readOnly}
            onChange={handleTableChange}
            {...dataPickerOptions}
          />
        </NotebookCellItem>
      </NotebookCell>
    </>
  );
};
