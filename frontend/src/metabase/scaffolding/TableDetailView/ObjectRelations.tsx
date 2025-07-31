import cx from "classnames";
import { inflect } from "inflection";
import { t } from "ttag";

import IconBorder from "metabase/common/components/IconBorder";
import CS from "metabase/css/core/index.css";
import { foreignKeyCountsByOriginTable } from "metabase/lib/schema_metadata";
import { type BoxProps, Flex, Icon, Loader } from "metabase/ui";
import type { ForeignKeyReferences } from "metabase/visualizations/components/ObjectDetail/types";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";

import S from "./ObjectRelations.module.css";

export interface RelationshipsProps {
  objectName?: string;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: ForeignKeyReferences;
  foreignKeyClicked?: (fk: ForeignKey) => void;
  disableClicks?: boolean;
  relationshipsDirection?: "horizontal" | "vertical";
}

export function Relationships({
  objectName: _objectName,
  tableForeignKeys,
  tableForeignKeyReferences,
  foreignKeyClicked,
  disableClicks,
  relationshipsDirection = "vertical",
}: RelationshipsProps & BoxProps): JSX.Element | null {
  if (!tableForeignKeys || !tableForeignKeys?.length) {
    return null;
  }

  const fkCountsByTable = foreignKeyCountsByOriginTable(tableForeignKeys);

  const sortedForeignTables = tableForeignKeys.toSorted((a, b) =>
    extractDisplayName(a).localeCompare(extractDisplayName(b)),
  );

  return (
    <Flex
      component="ul"
      direction={relationshipsDirection === "horizontal" ? "row" : "column"}
      gap="md"
      wrap={relationshipsDirection === "horizontal" ? "wrap" : "nowrap"}
    >
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
          disableClicks={disableClicks}
        />
      ))}
    </Flex>
  );
}

function extractDisplayName(fk: ForeignKey) {
  return (
    fk.origin?.table?.displayName?.() ?? fk.origin?.table?.display_name ?? ""
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
  disableClicks?: boolean;
}

function Relationship({
  fk,
  fkCountInfo,
  fkCount,
  foreignKeyClicked,
  disableClicks,
}: RelationshipProps) {
  const fkCountValue = fkCountInfo?.value || 0;
  const isLoaded = fkCountInfo?.status === 1;
  const fkClickable = isLoaded && Boolean(fkCountInfo.value);
  const originTableName = extractDisplayName(fk);

  const relationName = inflect(originTableName, fkCountValue);

  const via =
    fkCount > 1 ? (
      <span className={cx(CS.textMedium, CS.textNormal)}>
        {" "}
        {t`via ${extractDisplayName(fk)}`}
      </span>
    ) : null;

  return (
    <Flex
      component="li"
      c={"var(--mb-color-text-medium)"}
      data-testid={`fk-relation-${originTableName.toLowerCase()}`}
      gap="sm"
      align="center"
      className={cx(fkClickable && !disableClicks && S.clickable)}
      onClick={
        disableClicks
          ? undefined
          : fkClickable && foreignKeyClicked
            ? () => foreignKeyClicked(fk)
            : undefined
      }
    >
      <Flex direction="column" style={{ flexBasis: "50px" }}>
        <h2>{isLoaded ? fkCountValue : <Loader size="xs" />}</h2>
        <h5 className={CS.block}>
          {relationName}
          {via}
        </h5>
      </Flex>
      {fkClickable && foreignKeyClicked && (
        <IconBorder>
          <Icon
            data-testid="click-icon"
            name="chevronright"
            miw={20}
            size={10}
          />
        </IconBorder>
      )}
    </Flex>
  );
}
