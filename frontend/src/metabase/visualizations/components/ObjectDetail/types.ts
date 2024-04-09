import type Question from "metabase-lib/v1/Question";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import type {
  Card,
  DatasetData,
  QuestionDashboardCard,
} from "metabase-types/api";

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
  metadata?: Metadata;
  card?: Card;
  dashcard?: QuestionDashboardCard;
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
  showControls?: boolean;
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
