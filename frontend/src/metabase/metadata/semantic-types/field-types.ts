import { t } from "ttag";

import { isa } from "metabase-lib/v1/types/utils/isa";
import type { Field, IconName } from "metabase-types/api";

export type FieldTypeGroup =
  | "keys"
  | "dates"
  | "amounts"
  | "categories"
  | "text"
  | "location"
  | "structure";

export type FacetKey = "time" | "key" | "structure" | "lifecycle";

export const FACET_KEYS: FacetKey[] = ["time", "key", "structure", "lifecycle"];

export type Facets = Partial<Record<FacetKey, string>>;

export type BaseTypeGroup = "temporal" | "number" | "text" | "boolean";

export type Additivity =
  | "additive"
  | "semi-additive"
  | "non-additive"
  | "range"
  | "not-a-measure";

type FieldTypeDefinition = {
  id: string;
  parent: string | null;
  group: FieldTypeGroup;
  label: () => string;
  icon: IconName;
  baseTypes: BaseTypeGroup[];
  facet?: FacetKey;
  isNew?: boolean;
};

const ANY: BaseTypeGroup[] = [];
const TEMPORAL: BaseTypeGroup[] = ["temporal"];
const NUMBER: BaseTypeGroup[] = ["number"];
const TEXT: BaseTypeGroup[] = ["text"];
const TEXT_OR_NUMBER: BaseTypeGroup[] = ["text", "number"];
const FLAG: BaseTypeGroup[] = ["boolean", "number"];

const FIELD_TYPES: FieldTypeDefinition[] = [
  {
    id: "type/PK",
    parent: null,
    group: "keys",
    label: () => t`Entity key`,
    icon: "label",
    baseTypes: ANY,
  },
  {
    id: "type/FK",
    parent: null,
    group: "keys",
    label: () => t`Foreign key`,
    icon: "connections",
    baseTypes: ANY,
  },
  {
    id: "type/SurrogateKey",
    parent: "type/PK",
    group: "keys",
    label: () => t`Surrogate key`,
    icon: "label",
    baseTypes: ANY,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/HashKey",
    parent: "type/SurrogateKey",
    group: "keys",
    label: () => t`Hash key`,
    icon: "label",
    baseTypes: TEXT,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/NaturalKey",
    parent: null,
    group: "keys",
    label: () => t`Natural key`,
    icon: "key",
    baseTypes: TEXT_OR_NUMBER,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/DurableKey",
    parent: "type/NaturalKey",
    group: "keys",
    label: () => t`Durable key`,
    icon: "key",
    baseTypes: TEXT_OR_NUMBER,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/ExternalID",
    parent: "type/NaturalKey",
    group: "keys",
    label: () => t`External ID`,
    icon: "external",
    baseTypes: TEXT_OR_NUMBER,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/DegenerateDimension",
    parent: "type/NaturalKey",
    group: "keys",
    label: () => t`Document number`,
    icon: "key",
    baseTypes: TEXT_OR_NUMBER,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/TenantKey",
    parent: "type/FK",
    group: "keys",
    label: () => t`Tenant key`,
    icon: "connections",
    baseTypes: ANY,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/ParentKey",
    parent: "type/FK",
    group: "keys",
    label: () => t`Parent key`,
    icon: "connections",
    baseTypes: ANY,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/PolymorphicKey",
    parent: "type/FK",
    group: "keys",
    label: () => t`Polymorphic key`,
    icon: "connections",
    baseTypes: ANY,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/RoleKey",
    parent: "type/FK",
    group: "keys",
    label: () => t`Role-playing key`,
    icon: "connections",
    baseTypes: ANY,
    facet: "key",
    isNew: true,
  },
  {
    id: "type/TypeDiscriminator",
    parent: "type/Category",
    group: "keys",
    label: () => t`Target type`,
    icon: "string",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/ArrayIndex",
    parent: null,
    group: "keys",
    label: () => t`Position in list`,
    icon: "list",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Version",
    parent: null,
    group: "keys",
    label: () => t`Version`,
    icon: "history",
    baseTypes: TEXT_OR_NUMBER,
    isNew: true,
  },
  {
    id: "type/CreationTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Creation timestamp`,
    icon: "calendar",
    baseTypes: TEMPORAL,
  },
  {
    id: "type/UpdatedTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Updated timestamp`,
    icon: "calendar",
    baseTypes: TEMPORAL,
  },
  {
    id: "type/DeletionTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Deletion timestamp`,
    icon: "calendar",
    baseTypes: TEMPORAL,
  },
  {
    id: "type/CancelationTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Cancelation timestamp`,
    icon: "calendar",
    baseTypes: TEMPORAL,
  },
  {
    id: "type/JoinTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Join timestamp`,
    icon: "calendar",
    baseTypes: TEMPORAL,
  },
  {
    id: "type/Birthdate",
    parent: null,
    group: "dates",
    label: () => t`Birthday`,
    icon: "birthday",
    baseTypes: TEMPORAL,
  },
  {
    id: "type/EventTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Event time`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/MilestoneTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Milestone`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/StartTimestamp",
    parent: "type/MilestoneTimestamp",
    group: "dates",
    label: () => t`Start`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/EndTimestamp",
    parent: "type/MilestoneTimestamp",
    group: "dates",
    label: () => t`End or due`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/ValidFrom",
    parent: null,
    group: "dates",
    label: () => t`Valid from`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/ValidTo",
    parent: null,
    group: "dates",
    label: () => t`Valid to`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/PeriodKey",
    parent: null,
    group: "dates",
    label: () => t`Snapshot period`,
    icon: "calendar",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/LoadTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Loaded at`,
    icon: "sync",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/LastActivityTimestamp",
    parent: null,
    group: "dates",
    label: () => t`Last activity`,
    icon: "clock",
    baseTypes: TEMPORAL,
    facet: "time",
    isNew: true,
  },
  {
    id: "type/TimeZone",
    parent: "type/Category",
    group: "dates",
    label: () => t`Time zone`,
    icon: "globe",
    baseTypes: TEXT_OR_NUMBER,
    isNew: true,
  },
  {
    id: "type/Currency",
    parent: null,
    group: "amounts",
    label: () => t`Currency`,
    icon: "currency",
    baseTypes: NUMBER,
  },
  {
    id: "type/Cost",
    parent: "type/Currency",
    group: "amounts",
    label: () => t`Cost`,
    icon: "currency",
    baseTypes: NUMBER,
  },
  {
    id: "type/Income",
    parent: "type/Currency",
    group: "amounts",
    label: () => t`Income`,
    icon: "currency",
    baseTypes: NUMBER,
  },
  {
    id: "type/Discount",
    parent: "type/Currency",
    group: "amounts",
    label: () => t`Discount`,
    icon: "currency",
    baseTypes: NUMBER,
  },
  {
    id: "type/GrossMargin",
    parent: "type/Currency",
    group: "amounts",
    label: () => t`Gross margin`,
    icon: "currency",
    baseTypes: NUMBER,
  },
  {
    id: "type/Price",
    parent: "type/Currency",
    group: "amounts",
    label: () => t`Price`,
    icon: "currency",
    baseTypes: NUMBER,
  },
  {
    id: "type/UnitPrice",
    parent: "type/Price",
    group: "amounts",
    label: () => t`Unit price`,
    icon: "currency",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Balance",
    parent: null,
    group: "amounts",
    label: () => t`Balance`,
    icon: "currency",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Quantity",
    parent: null,
    group: "amounts",
    label: () => t`Quantity`,
    icon: "int",
    baseTypes: NUMBER,
  },
  {
    id: "type/Count",
    parent: "type/Quantity",
    group: "amounts",
    label: () => t`Count`,
    icon: "int",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Bytes",
    parent: "type/Quantity",
    group: "amounts",
    label: () => t`Size in bytes`,
    icon: "int",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Duration",
    parent: null,
    group: "amounts",
    label: () => t`Duration`,
    icon: "hourglass",
    baseTypes: NUMBER,
  },
  {
    id: "type/Share",
    parent: null,
    group: "amounts",
    label: () => t`Share`,
    icon: "gauge",
    baseTypes: NUMBER,
  },
  {
    id: "type/Rate",
    parent: "type/Share",
    group: "amounts",
    label: () => t`Rate`,
    icon: "gauge",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Weight",
    parent: "type/Share",
    group: "amounts",
    label: () => t`Allocation weight`,
    icon: "gauge",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/Percentage",
    parent: null,
    group: "amounts",
    label: () => t`Percentage`,
    icon: "gauge",
    baseTypes: NUMBER,
  },
  {
    id: "type/Score",
    parent: null,
    group: "amounts",
    label: () => t`Score`,
    icon: "gauge",
    baseTypes: NUMBER,
  },
  {
    id: "type/RangeBound",
    parent: null,
    group: "amounts",
    label: () => t`Range bound`,
    icon: "ruler",
    baseTypes: NUMBER,
    isNew: true,
  },
  {
    id: "type/CurrencyCode",
    parent: "type/Category",
    group: "amounts",
    label: () => t`Currency code`,
    icon: "currency",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/UnitOfMeasure",
    parent: "type/Category",
    group: "amounts",
    label: () => t`Unit of measure`,
    icon: "ruler",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Category",
    parent: null,
    group: "categories",
    label: () => t`Category`,
    icon: "string",
    baseTypes: TEXT_OR_NUMBER,
  },
  {
    id: "type/Status",
    parent: "type/Category",
    group: "categories",
    label: () => t`Status`,
    icon: "flag",
    baseTypes: TEXT_OR_NUMBER,
    isNew: true,
  },
  {
    id: "type/Priority",
    parent: "type/Category",
    group: "categories",
    label: () => t`Priority`,
    icon: "arrow_up",
    baseTypes: TEXT_OR_NUMBER,
    isNew: true,
  },
  {
    id: "type/Reason",
    parent: "type/Category",
    group: "categories",
    label: () => t`Reason`,
    icon: "string",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Kind",
    parent: "type/Category",
    group: "categories",
    label: () => t`Kind`,
    icon: "string",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Source",
    parent: "type/Category",
    group: "categories",
    label: () => t`Source`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/Channel",
    parent: "type/Source",
    group: "categories",
    label: () => t`Channel`,
    icon: "string",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Product",
    parent: "type/Category",
    group: "categories",
    label: () => t`Product`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/Locale",
    parent: "type/Category",
    group: "categories",
    label: () => t`Locale`,
    icon: "globe",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Color",
    parent: "type/Category",
    group: "categories",
    label: () => t`Color`,
    icon: "palette",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Tags",
    parent: null,
    group: "categories",
    label: () => t`Tags`,
    icon: "label",
    baseTypes: ["text"],
    isNew: true,
  },
  {
    id: "type/Flag",
    parent: null,
    group: "categories",
    label: () => t`Yes/no`,
    icon: "check",
    baseTypes: FLAG,
    isNew: true,
  },
  {
    id: "type/SoftDeleteFlag",
    parent: "type/Flag",
    group: "categories",
    label: () => t`Deleted flag`,
    icon: "trash",
    baseTypes: FLAG,
    facet: "lifecycle",
    isNew: true,
  },
  {
    id: "type/CurrentRowFlag",
    parent: "type/Flag",
    group: "categories",
    label: () => t`Current version flag`,
    icon: "check",
    baseTypes: FLAG,
    facet: "lifecycle",
    isNew: true,
  },
  {
    id: "type/TestDataFlag",
    parent: "type/Flag",
    group: "categories",
    label: () => t`Test data flag`,
    icon: "beaker",
    baseTypes: FLAG,
    facet: "lifecycle",
    isNew: true,
  },
  {
    id: "type/PrimaryFlag",
    parent: "type/Flag",
    group: "categories",
    label: () => t`Primary flag`,
    icon: "star",
    baseTypes: FLAG,
    isNew: true,
  },
  {
    id: "type/Name",
    parent: null,
    group: "text",
    label: () => t`Entity name`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/Title",
    parent: null,
    group: "text",
    label: () => t`Title`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/Description",
    parent: null,
    group: "text",
    label: () => t`Description`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/Email",
    parent: null,
    group: "text",
    label: () => t`Email`,
    icon: "mail",
    baseTypes: TEXT,
  },
  {
    id: "type/Phone",
    parent: null,
    group: "text",
    label: () => t`Phone`,
    icon: "string",
    baseTypes: TEXT_OR_NUMBER,
    isNew: true,
  },
  {
    id: "type/URL",
    parent: null,
    group: "text",
    label: () => t`URL`,
    icon: "link",
    baseTypes: TEXT,
  },
  {
    id: "type/ImageURL",
    parent: "type/URL",
    group: "text",
    label: () => t`Image URL`,
    icon: "link",
    baseTypes: TEXT,
  },
  {
    id: "type/AvatarURL",
    parent: "type/ImageURL",
    group: "text",
    label: () => t`Avatar image URL`,
    icon: "link",
    baseTypes: TEXT,
  },
  {
    id: "type/IPAddress",
    parent: null,
    group: "text",
    label: () => t`IP address`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/UserAgent",
    parent: null,
    group: "text",
    label: () => t`Browser or device`,
    icon: "string",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/FilePath",
    parent: null,
    group: "text",
    label: () => t`File`,
    icon: "document",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/Hash",
    parent: null,
    group: "text",
    label: () => t`Hash`,
    icon: "string",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/SerializedJSON",
    parent: null,
    group: "text",
    label: () => t`JSON`,
    icon: "string",
    baseTypes: TEXT,
  },
  {
    id: "type/Address",
    parent: null,
    group: "location",
    label: () => t`Address`,
    icon: "location",
    baseTypes: TEXT,
  },
  {
    id: "type/City",
    parent: "type/Category",
    group: "location",
    label: () => t`City`,
    icon: "location",
    baseTypes: TEXT,
  },
  {
    id: "type/State",
    parent: "type/Category",
    group: "location",
    label: () => t`State`,
    icon: "location",
    baseTypes: TEXT,
  },
  {
    id: "type/Country",
    parent: "type/Category",
    group: "location",
    label: () => t`Country`,
    icon: "location",
    baseTypes: TEXT,
  },
  {
    id: "type/ZipCode",
    parent: null,
    group: "location",
    label: () => t`Zip code`,
    icon: "location",
    baseTypes: TEXT_OR_NUMBER,
  },
  {
    id: "type/Latitude",
    parent: null,
    group: "location",
    label: () => t`Latitude`,
    icon: "location",
    baseTypes: NUMBER,
  },
  {
    id: "type/Longitude",
    parent: null,
    group: "location",
    label: () => t`Longitude`,
    icon: "location",
    baseTypes: NUMBER,
  },
  {
    id: "type/SystemColumn",
    parent: null,
    group: "structure",
    label: () => t`Loader column`,
    icon: "gear",
    baseTypes: ANY,
    facet: "structure",
    isNew: true,
  },
  {
    id: "type/RowHash",
    parent: "type/SystemColumn",
    group: "structure",
    label: () => t`Row hash`,
    icon: "gear",
    baseTypes: TEXT,
    facet: "structure",
    isNew: true,
  },
  {
    id: "type/CustomProperty",
    parent: null,
    group: "structure",
    label: () => t`Custom property`,
    icon: "field",
    baseTypes: ANY,
    facet: "structure",
    isNew: true,
  },
  {
    id: "type/SourceSystem",
    parent: "type/Category",
    group: "structure",
    label: () => t`Source system`,
    icon: "database",
    baseTypes: TEXT,
    isNew: true,
  },
  {
    id: "type/HierarchyLevel",
    parent: null,
    group: "structure",
    label: () => t`Hierarchy level`,
    icon: "ordered_list",
    baseTypes: NUMBER,
    facet: "structure",
    isNew: true,
  },
  {
    id: "type/HierarchyPath",
    parent: null,
    group: "structure",
    label: () => t`Hierarchy path`,
    icon: "ordered_list",
    baseTypes: TEXT,
    facet: "structure",
    isNew: true,
  },
  {
    id: "type/SortOrder",
    parent: null,
    group: "structure",
    label: () => t`Sort order`,
    icon: "sort",
    baseTypes: NUMBER,
    facet: "structure",
    isNew: true,
  },
];

const FIELD_TYPES_BY_ID = new Map(FIELD_TYPES.map((type) => [type.id, type]));

export const NEW_FIELD_TYPE_IDS = FIELD_TYPES.filter((type) => type.isNew).map(
  (type) => type.id,
);

export function isKnownFieldType(type: string): boolean {
  return FIELD_TYPES_BY_ID.has(type);
}

export function getFieldTypeLabel(type: string): string {
  const definition = FIELD_TYPES_BY_ID.get(type);
  if (definition) {
    return definition.label();
  }
  const name = type.replace(/^type\//, "");
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function getFieldTypeIcon(type: string | null): IconName {
  return (type != null && FIELD_TYPES_BY_ID.get(type)?.icon) || "empty";
}

export function getFieldTypeGroup(type: string): FieldTypeGroup | null {
  return FIELD_TYPES_BY_ID.get(type)?.group ?? null;
}

export function getFacetKey(type: string): FacetKey | null {
  return FIELD_TYPES_BY_ID.get(type)?.facet ?? null;
}

export function isFieldTypeA(type: string | null, ancestor: string): boolean {
  let current: string | null = type;
  while (current != null) {
    if (current === ancestor) {
      return true;
    }
    const definition = FIELD_TYPES_BY_ID.get(current);
    if (
      definition == null ||
      (definition.parent == null && !definition.isNew)
    ) {
      return isa(current, ancestor);
    }
    current = definition.parent;
  }
  return false;
}

const BASE_TYPE_ANCESTORS: Record<BaseTypeGroup, string[]> = {
  temporal: ["type/Temporal"],
  number: ["type/Number"],
  text: ["type/Text", "type/TextLike"],
  boolean: ["type/Boolean"],
};

export function hasBaseType(
  field: Pick<Field, "base_type" | "effective_type">,
  groups: BaseTypeGroup[],
): boolean {
  const fieldType = field.effective_type ?? field.base_type;
  return groups.some((group) =>
    BASE_TYPE_ANCESTORS[group].some((ancestor) => isa(fieldType, ancestor)),
  );
}

export function isCompatibleFieldType(
  type: string,
  field: Pick<Field, "base_type" | "effective_type">,
): boolean {
  const definition = FIELD_TYPES_BY_ID.get(type);
  if (definition == null || definition.baseTypes.length === 0) {
    return true;
  }
  return hasBaseType(field, definition.baseTypes);
}

export function getFieldTypeGroupLabel(group: FieldTypeGroup): string {
  switch (group) {
    case "keys":
      return t`Keys`;
    case "dates":
      return t`Dates`;
    case "amounts":
      return t`Amounts`;
    case "categories":
      return t`Categories`;
    case "text":
      return t`Text`;
    case "location":
      return t`Location`;
    case "structure":
      return t`Structure`;
  }
}

export function getFacetKeyLabel(facetKey: FacetKey): string {
  switch (facetKey) {
    case "time":
      return t`Time`;
    case "key":
      return t`Key`;
    case "structure":
      return t`Structure`;
    case "lifecycle":
      return t`Lifecycle`;
  }
}

export type FieldTypeOption = {
  value: string;
  label: string;
  icon: IconName;
  isNew: boolean;
};

export function getFieldTypeOptions(
  field: Pick<Field, "base_type" | "effective_type">,
  currentValue: string | null,
): { group: string; items: FieldTypeOption[] }[] {
  const groups = new Map<FieldTypeGroup, FieldTypeOption[]>();
  FIELD_TYPES.forEach((type) => {
    if (type.id !== currentValue && !isCompatibleFieldType(type.id, field)) {
      return;
    }
    groups.set(type.group, [
      ...(groups.get(type.group) ?? []),
      {
        value: type.id,
        label: type.label(),
        icon: type.icon,
        isNew: type.isNew ?? false,
      },
    ]);
  });
  const options = Array.from(groups, ([group, items]) => ({
    group: getFieldTypeGroupLabel(group),
    items,
  }));
  if (currentValue != null && !FIELD_TYPES_BY_ID.has(currentValue)) {
    options.push({
      group: t`Other`,
      items: [
        {
          value: currentValue,
          label: getFieldTypeLabel(currentValue),
          icon: "string",
          isNew: false,
        },
      ],
    });
  }
  return options;
}

export function getFacetOptions(
  field: Pick<Field, "base_type" | "effective_type">,
): { group: string; items: { value: string; label: string }[] }[] {
  return FACET_KEYS.map((facetKey) => ({
    group: getFacetKeyLabel(facetKey),
    items: FIELD_TYPES.filter(
      (type) =>
        type.facet === facetKey && isCompatibleFieldType(type.id, field),
    ).map((type) => ({ value: type.id, label: type.label() })),
  })).filter((group) => group.items.length > 0);
}

export function getAdditivity(type: string | null): Additivity | null {
  if (type == null) {
    return null;
  }
  if (isFieldTypeA(type, "type/Balance")) {
    return "semi-additive";
  }
  if (isFieldTypeA(type, "type/RangeBound")) {
    return "range";
  }
  if (
    ["type/Price", "type/Share", "type/Percentage", "type/Score"].some(
      (ancestor) => isFieldTypeA(type, ancestor),
    )
  ) {
    return "non-additive";
  }
  if (
    ["type/Currency", "type/Quantity", "type/Duration"].some((ancestor) =>
      isFieldTypeA(type, ancestor),
    )
  ) {
    return "additive";
  }
  if (
    [
      "type/PK",
      "type/FK",
      "type/NaturalKey",
      "type/ArrayIndex",
      "type/SortOrder",
      "type/Version",
      "type/SystemColumn",
      "type/HierarchyLevel",
    ].some((ancestor) => isFieldTypeA(type, ancestor))
  ) {
    return "not-a-measure";
  }
  return null;
}

export function getAdditivityLabel(additivity: Additivity): string {
  switch (additivity) {
    case "additive":
      return t`Sum`;
    case "semi-additive":
      return t`Sum across entities, latest value over time`;
    case "non-additive":
      return t`Average, never sum`;
    case "range":
      return t`Min or max`;
    case "not-a-measure":
      return t`Not a measure`;
  }
}

export function getFacetsLabel(facets: Facets): string {
  return FACET_KEYS.flatMap((facetKey) => {
    const type = facets[facetKey];
    return type ? [getFieldTypeLabel(type)] : [];
  }).join(", ");
}
