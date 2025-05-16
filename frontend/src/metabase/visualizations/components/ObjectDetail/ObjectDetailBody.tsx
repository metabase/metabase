import { useTranslateContent } from "metabase/i18n/hooks";
import { maybeTranslateDisplayNames } from "metabase/i18n/utils";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type {
  DatasetData,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import { ObjectDetailBodyWrapper } from "./ObjectDetailBody.styled";
import { DetailsTable } from "./ObjectDetailsTable";
import { Relationships } from "./ObjectRelationships";
import type { OnVisualizationClickType } from "./types";

export interface ObjectDetailBodyProps {
  data: DatasetData;
  objectName: string;
  zoomedRow: RowValue[];
  settings: VisualizationSettings;
  hasRelationships: boolean;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: {
    [key: number]: { status: number; value: number };
  };
  followForeignKey?: (fk: ForeignKey) => void;
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
}: ObjectDetailBodyProps): JSX.Element {
  const tc = useTranslateContent();
  const maybeTranslatedData = maybeTranslateDisplayNames(data, tc);

  return (
    <ObjectDetailBodyWrapper>
      <DetailsTable
        data={maybeTranslatedData}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
      />
      {hasRelationships && (
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
