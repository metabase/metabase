/* @flow */

import type { DatasetData, Column } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type { Field, FieldId } from "metabase/meta/types/Field";
import type { ReduxAction } from "metabase/meta/types/redux";
import Question from "metabase-lib/lib/Question";

export type ActionCreator = (props: ClickActionProps) => ClickAction[];

export type QueryMode = {
  name: string,
  actions: ActionCreator[],
  drills: ActionCreator[],
};

export type HoverData = Array<{ key: string, value: any, col?: Column }>;

export type HoverObject = {
  index?: number,
  axisIndex?: number,
  data?: HoverData,
  element?: ?HTMLElement,
  event?: MouseEvent,
};

export type DimensionValue = {
  value: Value,
  column: Column,
};

export type ClickObject = {
  value?: Value,
  column?: Column,
  dimensions?: DimensionValue[],
  event?: MouseEvent,
  element?: HTMLElement,
  seriesIndex?: number,
};

export type ClickAction = {
  title: any, // React Element
  icon?: string,
  popover?: (props: ClickActionPopoverProps) => any, // React Element
  question?: () => ?Question,
  url?: () => string,
  action?: () => ?ReduxAction,
  section?: string,
  name?: string,
};

export type ClickActionProps = {
  question: Question,
  clicked?: ClickObject,
};

export type OnChangeCardAndRun = ({
  nextCard: Card,
  previousCard?: ?Card,
}) => void;

export type ClickActionPopoverProps = {
  onChangeCardAndRun: OnChangeCardAndRun,
  onClose: () => void,
};

export type SingleSeries = { card: Card, data: DatasetData };
export type RawSeries = SingleSeries[];
export type TransformedSeries = RawSeries & { _raw: Series };
export type Series = RawSeries | TransformedSeries;

// These are the props provided to the visualization implementations BY the Visualization component
export type VisualizationProps = {
  series: Series,
  card: Card,
  data: DatasetData,
  settings: VisualizationSettings,

  className?: string,
  gridSize: ?{
    width: number,
    height: number,
  },

  width: number,
  height: number,

  showTitle: boolean,
  isDashboard: boolean,
  isEditing: boolean,
  isSettings: boolean,
  actionButtons: Node,

  onRender: ({
    yAxisSplit?: number[][],
    warnings?: string[],
  }) => void,
  onRenderError: (error: ?Error) => void,

  hovered: ?HoverObject,
  onHoverChange: (?HoverObject) => void,
  onVisualizationClick: (?ClickObject) => void,
  visualizationIsClickable: (?ClickObject) => boolean,
  onChangeCardAndRun: OnChangeCardAndRun,

  onUpdateVisualizationSettings: ({ [key: string]: any }) => void,

  // object detail
  tableMetadata: ?TableMetadata,
  tableForeignKeys: ?(ForeignKey[]),
  tableForeignKeyReferences: { [id: ForeignKeyId]: ForeignKeyCountInfo },
  loadObjectDetailFKReferences: () => void,
  followForeignKey: (fk: any) => void,
};

type ForeignKeyId = number;
type ForeignKey = {
  id: ForeignKeyId,
  relationship: string,
  origin: Field,
  origin_id: FieldId,
  destination: Field,
  destination_id: FieldId,
};

type ForeignKeyCountInfo = {
  status: number,
  value: number,
};
