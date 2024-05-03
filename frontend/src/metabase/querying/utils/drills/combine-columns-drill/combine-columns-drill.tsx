import { t } from "ttag";

import { trackColumnCombineViaColumnHeader } from "metabase/querying/analytics";
import { updateSettings } from "metabase/visualizations/lib/settings";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

import { CombineColumnsDrill } from "./components";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  question,
  query,
  stageIndex,
  clicked,
}) => {
  if (!clicked.column) {
    return [];
  }

  const column = Lib.fromLegacyColumn(query, stageIndex, clicked.column);

  const DrillPopover = ({
    onChangeCardAndRun,
    onUpdateVisualizationSettings,
    onClose,
  }: ClickActionPopoverProps) => (
    <CombineColumnsDrill
      column={column}
      query={query}
      stageIndex={stageIndex}
      onSubmit={newQuery => {
        const nextQuestion = question.setQuery(newQuery);
        const nextCard = nextQuestion.card();

        const columns = Lib.returnedColumns(query, stageIndex);
        const newColumns = Lib.returnedColumns(newQuery, -1);
        const newColumn = newColumns.find(column => !columns.includes(column))!;
        const info = Lib.displayInfo(newQuery, -1, newColumn);

        const isLink = Lib.isURL(column);
        if (isLink) {
          // Hack: Build a custom ref because getColumnKey doesn ot work for Lib.ColumnMetadata
          const ref = JSON.stringify(["ref", ["expression", info.displayName]]);

          // Merge the setting into settings
          nextCard.visualization_settings = updateSettings(
            nextCard.visualization_settings,
            {
              column_settings: {
                [ref]: { view_as: "link" },
              },
            },
          );
        }

        trackColumnCombineViaColumnHeader(newQuery, nextQuestion);
        onChangeCardAndRun({ nextCard });

        // The above setting does not work so can we update it manually?
        // This also seems to do nothing
        onUpdateVisualizationSettings(nextCard.visualization_settings);

        onClose();
      }}
    />
  );

  return [
    {
      name: "combine",
      title: t`Combine columns`,
      section: "combine",
      icon: "add",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
