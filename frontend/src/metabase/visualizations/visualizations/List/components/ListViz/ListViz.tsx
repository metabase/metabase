import cx from "classnames";
import { useMemo } from "react";

import { getShallowTables, useQuestionFromCard } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import { Box } from "metabase/ui";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

import { LIST_DEFINITION } from "../../definition";
import { ListView } from "../ListView/ListView";

import S from "./ListViz.module.css";

const ListVizComponent = ({
  card,
  data,
  settings,
  onVisualizationClick,
  queryBuilderMode,
  isDashboard,
  onZoomRow,
}: VisualizationProps & VisualizationPassThroughProps) => {
  const buildQuestion = useQuestionFromCard();
  const tables = useSelector(getShallowTables);
  const question = useMemo(
    () => (card ? buildQuestion(card) : null),
    [card, buildQuestion],
  );

  const { sortedColumnName, sortingDirection } = useMemo(() => {
    if (!question) {
      return {};
    }
    const query = question.query();
    const [orderBy] = Lib.orderBys(query, -1);
    if (orderBy) {
      const { name, direction } = Lib.displayInfo(query, -1, orderBy);
      return {
        sortedColumnName: name,
        sortingDirection: direction,
      };
    }
    return {};
  }, [question]);

  const entityType = useMemo(() => {
    if (!question) {
      return undefined;
    }

    try {
      const query = question.query();
      const sourceTableId = Lib.sourceTableOrCardId(query);
      return sourceTableId != null
        ? (tables[sourceTableId]?.entity_type ?? undefined)
        : undefined;
    } catch (error) {
      // If there's an error getting the entity type, return undefined
      console.warn("Could not determine entity type:", error);
      return undefined;
    }
  }, [question, tables]);

  const handleSort = (column: DatasetColumn) => {
    onVisualizationClick({ column });
  };

  return (
    <Box
      w="100%"
      pos="absolute"
      className={cx(S.ListViz, {
        [S.listViewDashcard]: isDashboard,
      })}
    >
      <ListView
        className={isDashboard ? S.dashboardListView : undefined}
        data={data}
        settings={settings}
        sortedColumnName={sortedColumnName}
        sortingDirection={sortingDirection}
        onSortClick={handleSort}
        entityType={entityType}
        isInteractive={queryBuilderMode !== "dataset"}
        onZoomRow={onZoomRow}
      />
    </Box>
  );
};

export const ListViz = Object.assign(ListVizComponent, LIST_DEFINITION);
