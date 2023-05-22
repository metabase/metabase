import type {
  Card,
  DatasetData,
  DashboardOrderedCard,
} from "metabase-types/api";

import type Table from "metabase-lib/metadata/Table";
import type ForeignKey from "metabase-lib/metadata/ForeignKey";
import type Question from "metabase-lib/Question";

export type ObjectId = number | string;

export type OnVisualizationClickType =
  | (({
      column,
      value,
      element,
    }: {
      column?: any;
      value?: any;
      element: Element;
    }) => void)
  | undefined;

export interface ObjectDetailProps {
  data: DatasetData;
  question?: Question;
  card?: Card;
  dashcard?: DashboardOrderedCard;
  isObjectDetail?: boolean; // whether this should be shown in a modal
  table?: Table | null;
  zoomedRow?: unknown[] | undefined;
  zoomedRowID?: ObjectId;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: {
    [key: number]: { status: number; value: number };
  };
  settings: any;
  canZoom?: boolean;
  canZoomPreviousRow?: boolean;
  canZoomNextRow?: boolean;
  isDataApp?: boolean;
  showActions?: boolean;
  showRelations?: boolean;
  showHeader?: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: any) => boolean;
  fetchTableFks: (id: number) => void;
  loadObjectDetailFKReferences: (opts: { objectId: ObjectId }) => void;
  followForeignKey: (opts: { objectId: ObjectId; fk: ForeignKey }) => void;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
  className?: string;
}

export type ForeignKeyReferences = {
  [key: number]: { status: number; value: number };
};
