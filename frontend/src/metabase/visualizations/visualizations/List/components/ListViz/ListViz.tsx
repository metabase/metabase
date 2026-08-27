import cx from "classnames";
import { useMemo } from "react";

import { Box } from "metabase/ui";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";

import { LIST_DEFINITION } from "../../definition";
import { ListView } from "../ListView/ListView";

import S from "./ListViz.module.css";

const ListVizComponent = ({
  card,
  metadata,
  data,
  settings,
  onVisualizationClick,
  queryBuilderMode,
  isDashboard,
  onZoomRow,
}: VisualizationProps & VisualizationPassThroughProps) => {
  const question = useMemo(() => {
    if (!card || !metadata) {
      return null;
    }
    return new Question(card, metadata);
  }, [card, metadata]);

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
      const table = question.metadata().table(sourceTableId);

      // Return the entity type if available, otherwise undefined
      // Use type assertion since entity_type exists in the database but not in TypeScript types
      return (table as any)?.entity_type;
    } catch (error) {
      // If there's an error getting the entity type, return undefined
      console.warn("Could not determine entity type:", error);
      return undefined;
    }
  }, [question]);

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
