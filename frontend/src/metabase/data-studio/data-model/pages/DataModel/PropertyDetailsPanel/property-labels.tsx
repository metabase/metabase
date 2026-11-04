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
import type { IconName } from "metabase-types/api";

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

export function PropertySignalBadge({ signal }: { signal: PropertySignal }) {
  return match(signal)
    .with({ type: "new" }, () => (
      <Badge color="brand" variant="light" size="sm">{t`New`}</Badge>
    ))
    .with({ type: "stale" }, () => (
      <Badge color="neutral" variant="light" size="sm">{t`Stale`}</Badge>
    ))
    .with({ type: "type-drift" }, () => (
      <Badge color="warning" variant="light" size="sm">{t`Bad values`}</Badge>
    ))
    .with({ type: "duplicate" }, ({ propertyName }) => (
      <Badge color="warning" variant="light" size="sm">
        {t`Looks like ${propertyName}`}
      </Badge>
    ))
    .exhaustive();
}

export const needsAttention = (property: RegistryProperty) =>
  !property.isHidden && property.signals.length > 0;
