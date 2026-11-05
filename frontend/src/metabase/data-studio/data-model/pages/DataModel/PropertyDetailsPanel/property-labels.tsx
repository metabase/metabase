import { match } from "ts-pattern";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  PROPERTY_SEMANTIC_TYPES,
  PROPERTY_TYPES,
  type PropertySemanticType,
  type PropertySignal,
  type PropertyType,
  type RegistryProperty,
  getPropertyBaseType,
} from "metabase/metadata/table-structure";
import { Badge } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName, Table } from "metabase-types/api";

export function getPropertyTypeLabel(type: PropertyType) {
  return match(type)
    .with("text", () => t`Text`)
    .with("integer", () => t`Integer`)
    .with("decimal", () => t`Decimal`)
    .with("date", () => t`Date`)
    .with("boolean", () => t`True or false`)
    .exhaustive();
}

export function getPropertySemanticTypeLabel(
  semanticType: PropertySemanticType,
) {
  return match(semanticType)
    .with("type/Category", () => t`Category`)
    .with("type/Email", () => t`Email`)
    .with("type/Currency", () => t`Currency`)
    .with("type/Quantity", () => t`Quantity`)
    .with("type/Score", () => t`Score`)
    .exhaustive();
}

export const getPropertyTypeOptions = () =>
  PROPERTY_TYPES.map((type) => ({
    value: type,
    label: getPropertyTypeLabel(type),
  }));

export const getPropertySemanticTypeOptions = () =>
  PROPERTY_SEMANTIC_TYPES.map((semanticType) => ({
    value: semanticType,
    label: getPropertySemanticTypeLabel(semanticType),
  }));

export function getPropertyIcon(
  property: Pick<RegistryProperty, "type" | "semanticType">,
): IconName {
  return getColumnIcon(
    Lib.legacyColumnTypeInfo({
      effective_type: getPropertyBaseType(property.type),
      semantic_type: property.semanticType,
    }),
  );
}

export const formatShare = (share: number) => `${Math.round(share * 100)}%`;

export type OpenPropertySignal = Exclude<
  PropertySignal,
  { type: "type-drift" }
>;

const isOpenSignal = (signal: PropertySignal): signal is OpenPropertySignal =>
  signal.type !== "type-drift";

export function PropertySignalBadge({
  signal,
}: {
  signal: OpenPropertySignal;
}) {
  return match(signal)
    .with({ type: "undefined" }, () => (
      <Badge color="warning" variant="light" flex="0 0 auto">
        {t`Definition not found`}
      </Badge>
    ))
    .with({ type: "unused" }, () => (
      <Badge
        color="neutral"
        variant="light"
        flex="0 0 auto"
      >{t`No values`}</Badge>
    ))
    .with({ type: "duplicate" }, ({ propertyLabel }) => (
      <Badge color="warning" variant="light" flex="0 0 auto">
        {t`Looks like ${propertyLabel}`}
      </Badge>
    ))
    .exhaustive();
}

export const getOpenSignals = (property: RegistryProperty) =>
  property.signals.filter(isOpenSignal);

export const needsAttention = (property: RegistryProperty) =>
  !property.isHidden &&
  property.mergedInto == null &&
  getOpenSignals(property).length > 0;

export const getMissingBindingMessage = () =>
  t`Pick the entity key, property and value columns in Details.`;

export function getEntityNoun(table: Pick<Table, "display_name"> | undefined) {
  const singular = table
    ? table.display_name.toLowerCase().replace(/s$/, "")
    : t`entity`;
  return {
    singular,
    plural: table ? table.display_name.toLowerCase() : t`entities`,
    title: singular.charAt(0).toUpperCase() + singular.slice(1),
  };
}

export const getCustomPropertiesTitle = (
  entityTable: Pick<Table, "display_name"> | undefined,
) =>
  entityTable
    ? t`${getEntityNoun(entityTable).title} custom properties`
    : t`Custom properties`;
