import cx from "classnames";
import { inflect } from "inflection";
import { jt, t } from "ttag";

import IconBorder from "metabase/common/components/IconBorder";
import CS from "metabase/css/core/index.css";
import { foreignKeyCountsByOriginTable } from "metabase/lib/schema_metadata";
import { Box, type BoxProps, Icon, Loader } from "metabase/ui";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";

import S from "./ObjectRelationships.module.css";
import { ObjectRelationContent } from "./ObjectRelationships.styled";
import type { ForeignKeyReferences } from "./types";

export interface RelationshipsProps {
  objectName?: string;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: ForeignKeyReferences;
  foreignKeyClicked?: (fk: ForeignKey) => void;
}

export function Relationships({
  objectName,
  tableForeignKeys,
  tableForeignKeyReferences,
  foreignKeyClicked,
  ...rest
}: RelationshipsProps & BoxProps): JSX.Element | null {
  if (!tableForeignKeys || !tableForeignKeys?.length) {
    return null;
  }

  const fkCountsByTable = foreignKeyCountsByOriginTable(tableForeignKeys);

  const sortedForeignTables = tableForeignKeys.toSorted((a, b) =>
    (
      a.origin?.table?.displayName?.() ??
      a.origin?.table?.display_name ??
      ""
    ).localeCompare(
      b.origin?.table?.displayName?.() ?? b.origin?.table?.display_name ?? "",
    ),
  );

  return (
    <Box className={S.objectRelationships} {...rest}>
      <div className={cx(CS.textBold, CS.textMedium)}>
        {jt`${(
          <span className={CS.textDark} key={objectName}>
            {objectName}
          </span>
        )} is connected to:`}
      </div>

      <ul>
        {sortedForeignTables.map((fk) => (
          <Relationship
            key={`${fk.origin_id}-${fk.destination_id}`}
            fk={fk}
            fkCountInfo={
              fk.origin?.id != null
                ? tableForeignKeyReferences?.[Number(fk.origin.id)]
                : undefined
            }
            fkCount={
              (fk.origin?.table != null &&
                fkCountsByTable?.[fk.origin.table?.id]) ||
              0
            }
            foreignKeyClicked={foreignKeyClicked}
          />
        ))}
      </ul>
    </Box>
  );
}

interface RelationshipProps {
  fk: ForeignKey;
  fkCountInfo:
    | {
        status: number;
        value: number;
      }
    | undefined;
  fkCount: number;
  foreignKeyClicked?: (fk: ForeignKey) => void;
}

function Relationship({
  fk,
  fkCountInfo,
  fkCount,
  foreignKeyClicked,
}: RelationshipProps) {
  const fkCountValue = fkCountInfo?.value || 0;
  const isLoaded = fkCountInfo?.status === 1;
  const fkClickable = isLoaded && Boolean(fkCountInfo.value);
  const originTableName =
    fk.origin?.table?.displayName?.() ?? fk.origin?.table?.display_name ?? "";

  const relationName = inflect(originTableName, fkCountValue);

  const via =
    fkCount > 1 ? (
      <span className={cx(CS.textMedium, CS.textNormal)}>
        {" "}
        {t`via ${fk.origin?.displayName()}`}
      </span>
    ) : null;

  return (
    <li data-testid={`fk-relation-${originTableName.toLowerCase()}`}>
      <ObjectRelationContent
        isClickable={fkClickable}
        onClick={
          fkClickable && foreignKeyClicked
            ? () => foreignKeyClicked(fk)
            : undefined
        }
      >
        <div>
          <h2>{isLoaded ? fkCountValue : <Loader size="xs" />}</h2>
          <h5 className={CS.block}>
            {relationName}
            {via}
          </h5>
        </div>
        {fkClickable && foreignKeyClicked && (
          <IconBorder className={CS.flexAlignRight}>
            <Icon data-testid="click-icon" name="chevronright" size={10} />
          </IconBorder>
        )}
      </ObjectRelationContent>
    </li>
  );
}
