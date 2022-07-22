import React from "react";
import { t, jt } from "ttag";
import cx from "classnames";
import { inflect } from "inflection";

import { ForeignKey } from "metabase-types/api";

import IconBorder from "metabase/components/IconBorder";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Icon from "metabase/components/Icon";

import { foreignKeyCountsByOriginTable } from "metabase/lib/schema_metadata";

import { ObjectRelationships } from "./ObjectDetail.styled";

export interface RelationshipsProps {
  objectName: string;
  tableForeignKeys: ForeignKey[];
  tableForeignKeyReferences: {
    [key: number]: { status: number; value: number };
  };
  foreignKeyClicked: (fk: ForeignKey) => void;
}

export function Relationships({
  objectName,
  tableForeignKeys,
  tableForeignKeyReferences,
  foreignKeyClicked,
}: RelationshipsProps): JSX.Element | null {
  if (!tableForeignKeys || !tableForeignKeys?.length) {
    return null;
  }

  const fkCountsByTable = foreignKeyCountsByOriginTable(tableForeignKeys);

  const sortedForeignTables = tableForeignKeys.sort((a, b) =>
    a.origin.table.display_name.localeCompare(b.origin.table.display_name),
  );

  return (
    <ObjectRelationships>
      <div className="text-bold text-medium">
        {jt`${(
          <span className="text-dark" key={objectName}>
            {objectName}
          </span>
        )} is connected to:`}
      </div>

      <ul>
        {sortedForeignTables.map(fk => (
          <Relationship
            key={`${fk.origin_id}-${fk.destination_id}`}
            fk={fk}
            fkCountInfo={tableForeignKeyReferences?.[fk.origin.id]}
            fkCount={fkCountsByTable?.[fk.origin.table.id] || 0}
            foreignKeyClicked={foreignKeyClicked}
          />
        ))}
      </ul>
    </ObjectRelationships>
  );
}

const chevron = (
  <IconBorder className="flex-align-right">
    <Icon name="chevronright" size={10} />
  </IconBorder>
);

interface RelationshipProps {
  fk: ForeignKey;
  fkCountInfo: { status: number; value: number } | null;
  fkCount: number;
  foreignKeyClicked: (fk: ForeignKey) => void;
}

function Relationship({
  fk,
  fkCountInfo,
  fkCount,
  foreignKeyClicked,
}: RelationshipProps) {
  const fkCountValue = fkCountInfo?.value || 0;
  const isLoaded = fkCountInfo?.status === 1;
  const fkClickable = isLoaded && fkCountInfo.value;
  const originTableName = fk.origin.table.display_name;

  const relationName = inflect(originTableName, fkCountValue);

  const via =
    fkCount > 1 ? (
      <span className="text-medium text-normal">
        {" "}
        {t`via ${fk.origin.display_name}`}
      </span>
    ) : null;

  const classes = cx("flex align-center my2 pb2 border-bottom", {
    "text-brand-hover cursor-pointer text-dark": fkClickable,
    "text-medium": !fkClickable,
  });

  return (
    <li data-testid={`fk-relation-${originTableName.toLowerCase()}`}>
      <div
        className={classes}
        onClick={fkClickable ? () => foreignKeyClicked(fk) : undefined}
      >
        <div>
          <h2>{isLoaded ? fkCountValue : <LoadingSpinner size={25} />}</h2>
          <h5 className="block">
            {relationName}
            {via}
          </h5>
        </div>
        {!!fkClickable && chevron}
      </div>
    </li>
  );
}
