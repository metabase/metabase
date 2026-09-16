import cx from "classnames";
import { useMemo } from "react";

import { skipToken, useGetTableQuery } from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import { Box } from "metabase/ui";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { type DatasetColumn, isConcreteTableId } from "metabase-types/api";

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

  // A saved question's virtual table has no entity type, so only a real table
  // is worth asking for.
  const sourceTableId = useMemo(() => {
    if (!question) {
      return undefined;
    }
    try {
      const id = Lib.sourceTableOrCardId(question.query());
      return id != null && isConcreteTableId(id) ? id : undefined;
    } catch (error) {
      console.warn("Could not determine the source table:", error);
      return undefined;
    }
  }, [question]);

  const { data: table } = useGetTableQuery(
    sourceTableId != null ? { id: sourceTableId } : skipToken,
  );
  const entityType = table?.entity_type ?? undefined;

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
