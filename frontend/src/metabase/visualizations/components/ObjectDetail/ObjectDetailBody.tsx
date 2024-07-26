import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import { ObjectDetailBodyWrapper } from "./ObjectDetailBody.styled";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";
import type { OnVisualizationClickType } from "./types";

export interface ObjectDetailBodyProps {
  data: DatasetData;
  objectName: string;
  zoomedRow: unknown[];
  settings: VisualizationSettings;
  hasRelationships: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: {
    [key: number]: { status: number; value: number };
  };
  followForeignKey?: (fk: ForeignKey) => void;
  handleClick: (event: React.MouseEvent<HTMLElement>) => void;
}

export function ObjectDetailBody({
  data,
  objectName,
  zoomedRow,
  settings,
  hasRelationships = false,
  onVisualizationClick,
  visualizationIsClickable,
  tableForeignKeys,
  tableForeignKeyReferences,
  followForeignKey,
  handleClick,
}: ObjectDetailBodyProps): JSX.Element {
  const showRelationships =
    hasRelationships &&
    tableForeignKeys &&
    tableForeignKeyReferences &&
    followForeignKey;

  return (
    <ObjectDetailBodyWrapper>
      <div onClick={handleClick}>
        <DetailsTable
          data={data}
          zoomedRow={zoomedRow}
          settings={settings}
          onVisualizationClick={onVisualizationClick}
          visualizationIsClickable={visualizationIsClickable}
        />
      </div>
      {showRelationships && (
        <Relationships
          objectName={objectName}
          tableForeignKeys={tableForeignKeys}
          tableForeignKeyReferences={tableForeignKeyReferences}
          foreignKeyClicked={followForeignKey}
        />
      )}
    </ObjectDetailBodyWrapper>
  );
}
