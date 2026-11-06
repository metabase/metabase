import { t } from "ttag";
import _ from "underscore";

import { type TableRole, isRoleA } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isDate, isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

import {
  type BaseTypeGroup,
  type Facets,
  getFacetKey,
  hasBaseType,
  isFieldTypeA,
} from "./field-types";
import type { InferenceConfidence } from "./subject-inference";
import { type TableSubject, isSubjectA } from "./subjects";

export type FieldTypeInference = {
  semanticType: string | null;
  facets: Facets;
  signal: string;
  confidence: InferenceConfidence;
};

export type FieldInferenceContext = {
  fields: Field[];
  role: TableRole | null;
  getTargetSubject?: (field: Field) => TableSubject | null;
};

type NameRule = {
  pattern: RegExp;
  type: string;
  baseTypes: BaseTypeGroup[];
  hint: string;
  confidence?: InferenceConfidence;
};

const TEMPORAL: BaseTypeGroup[] = ["temporal"];
const NUMBER: BaseTypeGroup[] = ["number"];
const TEXT: BaseTypeGroup[] = ["text"];
const TEXT_OR_NUMBER: BaseTypeGroup[] = ["text", "number"];
const FLAG: BaseTypeGroup[] = ["boolean", "number"];
const ANY: BaseTypeGroup[] = [];

const NAME_RULES: NameRule[] = [
  {
    pattern: /(^|_)(phone|mobile|telephone|fax)(_number)?$/,
    type: "type/Phone",
    baseTypes: TEXT_OR_NUMBER,
    hint: "phone",
  },
  {
    pattern: /(^|_)e?mail(_address)?$/,
    type: "type/Email",
    baseTypes: TEXT,
    hint: "email",
  },
  {
    pattern:
      /^(external|source|legacy|remote|vendor|third_party)_id$|_external_id$/,
    type: "type/ExternalID",
    baseTypes: TEXT_OR_NUMBER,
    hint: "external_id, source_id",
  },
  {
    pattern: /^(row_hash|record_hash|_hash|hashdiff)$/,
    type: "type/RowHash",
    baseTypes: TEXT,
    hint: "row_hash",
  },
  {
    pattern: /^hk_|_hk$|_hash_key$/,
    type: "type/HashKey",
    baseTypes: TEXT,
    hint: "hk_*",
  },
  {
    pattern: /(^|_)(hash|checksum|digest|md5|sha\d*)$/,
    type: "type/Hash",
    baseTypes: TEXT,
    hint: "*_hash",
  },
  {
    pattern: /^(version|revision|etag|rev)$|_version$/,
    type: "type/Version",
    baseTypes: TEXT_OR_NUMBER,
    hint: "version, revision",
  },
  {
    pattern:
      /^(valid_from|valid_start|effective_from|effective_start(_date)?)$/,
    type: "type/ValidFrom",
    baseTypes: TEMPORAL,
    hint: "valid_from",
  },
  {
    pattern:
      /^(valid_to|valid_until|valid_end|effective_to|effective_end(_date)?)$/,
    type: "type/ValidTo",
    baseTypes: TEMPORAL,
    hint: "valid_to",
  },
  {
    pattern: /^(_?loaded_at|synced_at|_etl_loaded_at|ingested_at)$/,
    type: "type/LoadTimestamp",
    baseTypes: TEMPORAL,
    hint: "loaded_at",
  },
  {
    pattern:
      /(^|_)(created|creation|inserted)(_at|_on|_date|_time|_timestamp)?$|^create_(date|time)$/,
    type: "type/CreationTimestamp",
    baseTypes: TEMPORAL,
    hint: "created_at",
  },
  {
    pattern:
      /(^|_)(updated|modified|last_modified|changed)(_at|_on|_date|_time)?$/,
    type: "type/UpdatedTimestamp",
    baseTypes: TEMPORAL,
    hint: "updated_at",
  },
  {
    pattern: /(^|_)deleted(_at|_on|_date)$/,
    type: "type/DeletionTimestamp",
    baseTypes: TEMPORAL,
    hint: "deleted_at",
  },
  {
    pattern: /(^|_)cancell?ed(_at|_on|_date)$/,
    type: "type/CancelationTimestamp",
    baseTypes: TEMPORAL,
    hint: "canceled_at",
  },
  {
    pattern: /(^|_)(joined|signup|signed_up|registered)(_at|_on|_date)?$/,
    type: "type/JoinTimestamp",
    baseTypes: TEMPORAL,
    hint: "joined_at",
  },
  {
    pattern: /birth/,
    type: "type/Birthdate",
    baseTypes: TEMPORAL,
    hint: "birthdate",
  },
  {
    pattern: /^last_/,
    type: "type/LastActivityTimestamp",
    baseTypes: TEMPORAL,
    hint: "last_*",
  },
  {
    pattern: /^(start|starts|started)(_|$)|_start(_date|_at|_time|_on)?$/,
    type: "type/StartTimestamp",
    baseTypes: TEMPORAL,
    hint: "start_*",
  },
  {
    pattern:
      /^(end|ends|ended|due|expires|expiry|expiration|completed|closed|close)(_|$)|_(end|due|expiry|expiration)(_date|_at|_time|_on)?$/,
    type: "type/EndTimestamp",
    baseTypes: TEMPORAL,
    hint: "end_*, due_*, expires_*",
  },
  {
    pattern:
      /^(date|timestamp|ts|time|event_time|event_date|event_timestamp|occurred_at|happened_at)$/,
    type: "type/EventTimestamp",
    baseTypes: TEMPORAL,
    hint: "date, timestamp, occurred_at",
  },
  {
    pattern:
      /^(day|week|month|quarter|year|period|date_day|date_month|period_start|as_of_date|snapshot_date)$/,
    type: "type/PeriodKey",
    baseTypes: TEMPORAL,
    hint: "day, month, period",
    confidence: "low",
  },
  {
    pattern: /^([a-z]+ed|paid|sent|won|lost|begun|done)_(at|on|date|time)$/,
    type: "type/MilestoneTimestamp",
    baseTypes: TEMPORAL,
    hint: "a verb with _at",
  },
  {
    pattern: /(^|_)(time_?zone|tz|utc_offset)$/,
    type: "type/TimeZone",
    baseTypes: TEXT_OR_NUMBER,
    hint: "timezone",
  },
  {
    pattern:
      /(^|_)(unit_price|unit_amount|unit_cost|rate_amount|price_per_unit)$/,
    type: "type/UnitPrice",
    baseTypes: NUMBER,
    hint: "unit_price, unit_amount",
  },
  {
    pattern:
      /(^|_)(balance|mrr|arr|remaining|on_hand|cumulative|outstanding|running_total)(_|$)/,
    type: "type/Balance",
    baseTypes: NUMBER,
    hint: "balance, mrr, on_hand",
    confidence: "low",
  },
  {
    pattern:
      /(^|_)(rate|ctr|cpc|cpm|cpa|roas)$|^(exchange|fx|tax|conversion)_rate$/,
    type: "type/Rate",
    baseTypes: NUMBER,
    hint: "*_rate, ctr, cpc",
  },
  {
    pattern: /(^|_)price$/,
    type: "type/Price",
    baseTypes: NUMBER,
    hint: "price",
  },
  {
    pattern: /(^|_)discounts?(_amount)?$/,
    type: "type/Discount",
    baseTypes: NUMBER,
    hint: "discount",
  },
  {
    pattern: /(^|_)(cost|costs|cogs|spend)$/,
    type: "type/Cost",
    baseTypes: NUMBER,
    hint: "cost, spend",
  },
  {
    pattern: /(^|_)(income|profit)$/,
    type: "type/Income",
    baseTypes: NUMBER,
    hint: "income",
  },
  {
    pattern: /(^|_)(gross_)?margin$/,
    type: "type/GrossMargin",
    baseTypes: NUMBER,
    hint: "margin",
  },
  {
    pattern:
      /(^|_)(amount|total|subtotal|revenue|fee|fees|tax|arpu|ltv|usd|eur)$|^amount_/,
    type: "type/Currency",
    baseTypes: NUMBER,
    hint: "amount, total, revenue",
  },
  {
    pattern: /(^|_)(bytes|file_size|size_bytes)$|_(kb|mb|gb)$/,
    type: "type/Bytes",
    baseTypes: NUMBER,
    hint: "bytes, file_size",
  },
  {
    pattern:
      /(^|_)(count|cnt)$|^(num|n|number_of|count_of)_|^(impressions|clicks|views|opens|visits|installs|conversions|sessions|downloads|signups|replies|likes|followers)$/,
    type: "type/Count",
    baseTypes: NUMBER,
    hint: "*_count, num_*, clicks",
  },
  {
    pattern: /(^|_)(quantity|qty|units)$/,
    type: "type/Quantity",
    baseTypes: NUMBER,
    hint: "quantity",
  },
  {
    pattern:
      /^(min|max|minimum|maximum|lower|upper)_|_(min|max|low|high|floor|ceiling|lower_bound|upper_bound)$/,
    type: "type/RangeBound",
    baseTypes: NUMBER,
    hint: "min_*, max_*",
  },
  {
    pattern: /(^|_)(percent|percentage|pct)$|^pct_/,
    type: "type/Percentage",
    baseTypes: NUMBER,
    hint: "percent",
  },
  {
    pattern: /(^|_)(ratio|share)$/,
    type: "type/Share",
    baseTypes: NUMBER,
    hint: "ratio, share",
  },
  {
    pattern: /(^|_)(score|rating|nps)$/,
    type: "type/Score",
    baseTypes: NUMBER,
    hint: "score, rating",
  },
  {
    pattern:
      /(^|_)(duration|elapsed)$|_(seconds|minutes|hours|ms|secs|mins|days)$|^time_to_/,
    type: "type/Duration",
    baseTypes: NUMBER,
    hint: "duration, *_seconds",
  },
  {
    pattern:
      /(^|_)(user_agent|browser|os|operating_system|device_type|platform)$/,
    type: "type/UserAgent",
    baseTypes: TEXT,
    hint: "user_agent, browser, os",
  },
  {
    pattern: /(^|_)(status|stage|phase|result|outcome)$/,
    type: "type/Status",
    baseTypes: TEXT_OR_NUMBER,
    hint: "status, stage",
  },
  {
    pattern: /(^|_)state$/,
    type: "type/Status",
    baseTypes: TEXT,
    hint: "state",
    confidence: "low",
  },
  {
    pattern: /(^|_)(priority|severity|urgency|tier)$/,
    type: "type/Priority",
    baseTypes: TEXT_OR_NUMBER,
    hint: "priority, severity",
  },
  {
    pattern: /(^|_)level$/,
    type: "type/Priority",
    baseTypes: TEXT_OR_NUMBER,
    hint: "level",
    confidence: "low",
  },
  {
    pattern: /(^|_)reason$|^reason_/,
    type: "type/Reason",
    baseTypes: TEXT,
    hint: "*_reason",
  },
  {
    pattern: /^(type|kind)$|_(type|kind)$/,
    type: "type/Kind",
    baseTypes: TEXT,
    hint: "type, *_type",
    confidence: "low",
  },
  {
    pattern: /(^|_)(channel|medium|utm_medium)$/,
    type: "type/Channel",
    baseTypes: TEXT,
    hint: "channel",
  },
  {
    pattern: /^(source_system|record_source|_source|system_of_record)$/,
    type: "type/SourceSystem",
    baseTypes: TEXT,
    hint: "source_system",
  },
  {
    pattern: /(^|_)(source|utm_source|referrer)$/,
    type: "type/Source",
    baseTypes: TEXT,
    hint: "source",
  },
  {
    pattern: /(^|_)(locale|language|lang)(_code)?$/,
    type: "type/Locale",
    baseTypes: TEXT,
    hint: "locale, language",
  },
  {
    pattern: /(^|_)colou?r(_hex|_code)?$/,
    type: "type/Color",
    baseTypes: TEXT,
    hint: "color",
  },
  {
    pattern: /(^|_)(tags|labels|keywords)$/,
    type: "type/Tags",
    baseTypes: TEXT,
    hint: "tags, labels",
  },
  {
    pattern: /(^|_)currency(_code)?$/,
    type: "type/CurrencyCode",
    baseTypes: TEXT,
    hint: "currency",
    confidence: "low",
  },
  {
    pattern: /(^|_)(unit|uom)$/,
    type: "type/UnitOfMeasure",
    baseTypes: TEXT,
    hint: "unit, uom",
    confidence: "low",
  },
  {
    pattern: /^(is_)?(deleted|archived|removed|trashed)$/,
    type: "type/SoftDeleteFlag",
    baseTypes: FLAG,
    hint: "deleted, is_deleted, archived",
  },
  {
    pattern: /^(is_current|is_latest|current_flag|current_version)$/,
    type: "type/CurrentRowFlag",
    baseTypes: FLAG,
    hint: "is_current",
  },
  {
    pattern: /^(is_test|livemode|test_mode|is_internal|is_sandbox|is_demo)$/,
    type: "type/TestDataFlag",
    baseTypes: FLAG,
    hint: "is_test, livemode",
  },
  {
    pattern: /^(is_default|is_primary|primary|default)$/,
    type: "type/PrimaryFlag",
    baseTypes: FLAG,
    hint: "is_primary, is_default",
  },
  {
    pattern: /^(is|has|can|should|was|allow|enable)_|_(flag|enabled)$/,
    type: "type/Flag",
    baseTypes: FLAG,
    hint: "is_*, has_*",
  },
  {
    pattern: /(^|_)(file_?name|file_?path|mime_type|content_type|attachment)$/,
    type: "type/FilePath",
    baseTypes: TEXT,
    hint: "file_name, mime_type",
  },
  {
    pattern: /(^|_)(avatar|profile_image|profile_picture)(_url)?$/,
    type: "type/AvatarURL",
    baseTypes: TEXT,
    hint: "avatar",
  },
  {
    pattern: /(^|_)(image|photo|thumbnail|logo|picture)(_url)?$/,
    type: "type/ImageURL",
    baseTypes: TEXT,
    hint: "image, photo",
  },
  {
    pattern: /(^|_)(url|link|website|homepage|href)$/,
    type: "type/URL",
    baseTypes: TEXT,
    hint: "url, website",
  },
  {
    pattern: /(^|_)(ip|ip_address|ipv4|ipv6)$/,
    type: "type/IPAddress",
    baseTypes: TEXT,
    hint: "ip_address",
  },
  {
    pattern: /^(name|full_name|display_name)$/,
    type: "type/Name",
    baseTypes: TEXT,
    hint: "name",
  },
  {
    pattern: /(^|_)(title|subject)$/,
    type: "type/Title",
    baseTypes: TEXT,
    hint: "title, subject",
  },
  {
    pattern: /(^|_)(description|summary|body|notes?)$/,
    type: "type/Description",
    baseTypes: TEXT,
    hint: "description",
  },
  {
    pattern: /(^|_)(address|street|address_line_?\d|address\d)$/,
    type: "type/Address",
    baseTypes: TEXT,
    hint: "address",
  },
  {
    pattern: /(^|_)city$/,
    type: "type/City",
    baseTypes: TEXT,
    hint: "city",
  },
  {
    pattern: /(^|_)country(_code)?$/,
    type: "type/Country",
    baseTypes: TEXT,
    hint: "country",
  },
  {
    pattern: /(^|_)(zip|zipcode|zip_code|postal_code|postcode)$/,
    type: "type/ZipCode",
    baseTypes: TEXT_OR_NUMBER,
    hint: "zip",
  },
  {
    pattern: /(^|_)(lat|latitude)$/,
    type: "type/Latitude",
    baseTypes: NUMBER,
    hint: "latitude",
  },
  {
    pattern: /(^|_)(lng|lon|long|longitude)$/,
    type: "type/Longitude",
    baseTypes: NUMBER,
    hint: "longitude",
  },
  {
    pattern:
      /(^|_)(sort_order|display_order|sort_index|sort|rank_order|order_index|ordinal|position)$/,
    type: "type/SortOrder",
    baseTypes: NUMBER,
    hint: "sort_order, position",
  },
  {
    pattern: /^(index|idx|array_index)$/,
    type: "type/ArrayIndex",
    baseTypes: NUMBER,
    hint: "index",
  },
  {
    pattern: /^(account|organization|org|workspace|tenant)_id$/,
    type: "type/TenantKey",
    baseTypes: ANY,
    hint: "account_id, workspace_id",
    confidence: "low",
  },
  {
    pattern: /^(parent|parent_id|manager_id|reports_to(_id)?)$/,
    type: "type/ParentKey",
    baseTypes: ANY,
    hint: "parent_id, manager_id",
    confidence: "low",
  },
  {
    pattern: /(^|_)(number|no|code|sku|reference|ref)$/,
    type: "type/NaturalKey",
    baseTypes: TEXT_OR_NUMBER,
    hint: "number, code, sku",
    confidence: "low",
  },
];

const LOADER_PREFIX_RE = /^(_fivetran_|_airbyte_|dbt_)/;

const LOADER_COLUMNS: { pattern: RegExp; type: string }[] = [
  { pattern: /^_fivetran_deleted$/, type: "type/SoftDeleteFlag" },
  {
    pattern:
      /^(_fivetran_synced|_airbyte_(extracted|emitted)_at|dbt_updated_at)$/,
    type: "type/LoadTimestamp",
  },
  { pattern: /^(_fivetran_start|dbt_valid_from)$/, type: "type/ValidFrom" },
  { pattern: /^(_fivetran_end|dbt_valid_to)$/, type: "type/ValidTo" },
  { pattern: /^_fivetran_active$/, type: "type/CurrentRowFlag" },
  {
    pattern: /^(_fivetran_id|_airbyte_raw_id|dbt_scd_id)$/,
    type: "type/RowHash",
  },
];

const CUSTOM_PROPERTY_RE = /^(custom|property|prop|cf)_(.+)$/;
const ADDRESS_SIBLING_RE =
  /(^|_)(city|zip|zip_code|postal_code|country|address)$/;
const PARENT_SIBLING_RE = /^(parent|parent_id|manager_id|reports_to(_id)?)$/;
const START_RE = /^(start|starts|started)(_|$)|_start(_date|_at|_time|_on)?$/;
const END_RE = /^(end|ends|ended)(_|$)|_end(_date|_at|_time|_on)?$/;
const MONEY_RE = /(^|_)(amount|total|subtotal|price|revenue|fee|cost|balance)$/;
const BRIDGE_WEIGHT_RE = /(^|_)(weight|allocation|share|split)$/;
const HISTORY_ACTIVE_RE = /^(active|is_active)$/;
const KEY_HASH_RE = /(^|_)(hash|hk|hkey|hash_key)$|^hk_/;
const KEY_SURROGATE_RE = /_(sk|key)$/;
const TENANT_NAME_RE = /^(account|organization|org|workspace|tenant)_id$/;

const nameOf = (field: Field) => field.name.toLowerCase();
const idOf = (field: Field): FieldId => getRawTableFieldId(field);

function inference(
  semanticType: string | null,
  signal: string,
  confidence: InferenceConfidence = "high",
  facets: Facets = {},
): FieldTypeInference {
  return { semanticType, facets, signal, confidence };
}

export function inferFieldType(
  field: Field,
  context: FieldInferenceContext,
): FieldTypeInference | null {
  const base =
    inferLoaderColumn(field) ??
    inferDeclaredKey(field, context) ??
    inferFromSiblings(field, context) ??
    inferCustomProperty(field) ??
    inferFromName(field);
  const result = withoutRedundantFacets(
    applyTableContext(field, context, base),
  );
  const isEmpty =
    result == null || (result.semanticType == null && _.isEmpty(result.facets));
  return isEmpty ? null : result;
}

export function inferTableFieldTypes(
  context: FieldInferenceContext,
): Map<FieldId, FieldTypeInference> {
  return new Map(
    context.fields.flatMap((field) => {
      const result = inferFieldType(field, context);
      return result ? [[idOf(field), result]] : [];
    }),
  );
}

function inferLoaderColumn(field: Field): FieldTypeInference | null {
  const name = nameOf(field);
  if (!LOADER_PREFIX_RE.test(name)) {
    return null;
  }
  const signal = t`Written by the loader, like every ${name.split("_").filter(Boolean)[0]} column`;
  if (isPK(field)) {
    return inference(null, signal, "high", {
      key: "type/SurrogateKey",
      structure: "type/SystemColumn",
    });
  }
  const specific = LOADER_COLUMNS.find(({ pattern }) => pattern.test(name));
  return specific
    ? inference(specific.type, signal, "high", {
        structure: "type/SystemColumn",
      })
    : inference("type/SystemColumn", signal);
}

function inferDeclaredKey(
  field: Field,
  { fields, getTargetSubject }: FieldInferenceContext,
): FieldTypeInference | null {
  const name = nameOf(field);
  if (isPK(field)) {
    if (KEY_HASH_RE.test(name)) {
      return inference("type/HashKey", t`Primary key named like a hash`);
    }
    if (KEY_SURROGATE_RE.test(name)) {
      return inference(
        "type/SurrogateKey",
        t`Primary key named like a warehouse key`,
      );
    }
    const hasOtherKey = fields.some(
      (sibling) => sibling !== field && (isPK(sibling) || isFK(sibling)),
    );
    if (isDate(field) && hasOtherKey) {
      return inference(null, t`A date that's part of the primary key`, "high", {
        time: "type/PeriodKey",
      });
    }
    return inference(null, t`Declared primary key`);
  }

  if (!isFK(field)) {
    return null;
  }
  const isSelfReference = fields.some(
    (sibling) => idOf(sibling) === field.fk_target_field_id,
  );
  if (isSelfReference) {
    return inference("type/ParentKey", t`Points at its own table`);
  }
  const polymorphicSibling = findPolymorphicTypeSibling(field, fields);
  if (polymorphicSibling) {
    return inference(
      "type/PolymorphicKey",
      t`Paired with ${polymorphicSibling.name}`,
    );
  }
  const targetSubject = getTargetSubject?.(field) ?? null;
  if (isSubjectA(targetSubject, "entity/OrganizationTable")) {
    return inference("type/TenantKey", t`Points at an accounts table`);
  }
  if (TENANT_NAME_RE.test(name)) {
    return inference("type/TenantKey", t`Foreign key named ${name}`);
  }
  const sameTarget = fields.filter(
    (sibling) =>
      sibling !== field &&
      isFK(sibling) &&
      sibling.fk_target_field_id != null &&
      sibling.fk_target_field_id === field.fk_target_field_id,
  );
  if (sameTarget.length > 0) {
    return inference(
      "type/RoleKey",
      t`${name} and ${sameTarget[0].name} point at the same table`,
    );
  }
  return inference(null, t`Declared foreign key`);
}

function findPolymorphicTypeSibling(
  field: Field,
  fields: Field[],
): Field | undefined {
  const match = /^(.+)_id$/.exec(nameOf(field));
  return match
    ? fields.find((sibling) => nameOf(sibling) === `${match[1]}_type`)
    : undefined;
}

function inferFromSiblings(
  field: Field,
  { fields }: FieldInferenceContext,
): FieldTypeInference | null {
  const name = nameOf(field);
  const siblings = fields.filter((sibling) => sibling !== field);
  const findSibling = (predicate: (sibling: Field) => boolean) =>
    siblings.find(predicate);

  const typeMatch = /^(.+)_type$/.exec(name);
  const idSibling =
    typeMatch &&
    findSibling((sibling) => nameOf(sibling) === `${typeMatch[1]}_id`);
  if (idSibling) {
    return inference(
      "type/TypeDiscriminator",
      t`Names the table ${idSibling.name} points at`,
    );
  }

  const typeSibling = findPolymorphicTypeSibling(field, fields);
  if (typeSibling) {
    return inference("type/PolymorphicKey", t`Paired with ${typeSibling.name}`);
  }

  if (/(^|_)currency(_code)?$/.test(name) && hasBaseType(field, TEXT)) {
    const money = findSibling(
      (sibling) =>
        hasBaseType(sibling, NUMBER) &&
        (MONEY_RE.test(nameOf(sibling)) ||
          isFieldTypeA(sibling.semantic_type ?? null, "type/Currency")),
    );
    if (money) {
      return inference(
        "type/CurrencyCode",
        t`The currency of ${money.name} next to it`,
      );
    }
  }

  if (/(^|_)(unit|uom)$/.test(name) && hasBaseType(field, TEXT)) {
    const measure = findSibling(
      (sibling) =>
        hasBaseType(sibling, NUMBER) && !isPK(sibling) && !isFK(sibling),
    );
    if (measure) {
      return inference(
        "type/UnitOfMeasure",
        t`The unit of ${measure.name} next to it`,
      );
    }
  }

  if (isDate(field) && START_RE.test(name)) {
    const end = findSibling(
      (sibling) => isDate(sibling) && END_RE.test(nameOf(sibling)),
    );
    if (end) {
      return inference("type/StartTimestamp", t`Pairs with ${end.name}`);
    }
  }
  if (isDate(field) && END_RE.test(name)) {
    const start = findSibling(
      (sibling) => isDate(sibling) && START_RE.test(nameOf(sibling)),
    );
    if (start) {
      return inference("type/EndTimestamp", t`Pairs with ${start.name}`);
    }
  }

  const parent = findSibling(
    (sibling) =>
      PARENT_SIBLING_RE.test(nameOf(sibling)) ||
      (isFK(sibling) &&
        fields.some((other) => idOf(other) === sibling.fk_target_field_id)),
  );
  if (parent && /^(level|depth)$/.test(name) && hasBaseType(field, NUMBER)) {
    return inference("type/HierarchyLevel", t`Next to ${parent.name}`);
  }
  if (parent && /^(path|materialized_path)$/.test(name)) {
    return inference("type/HierarchyPath", t`Next to ${parent.name}`);
  }

  if (/(^|_)state$/.test(name) && hasBaseType(field, TEXT)) {
    const address = findSibling((sibling) =>
      ADDRESS_SIBLING_RE.test(nameOf(sibling)),
    );
    if (address) {
      return inference("type/State", t`Next to ${address.name}`);
    }
  }

  return null;
}

function inferCustomProperty(field: Field): FieldTypeInference | null {
  const match = CUSTOM_PROPERTY_RE.exec(nameOf(field));
  if (!match) {
    return null;
  }
  const prefix = match[1];
  const meaning = inferFromName({ ...field, name: match[2] });
  const signal = t`Starts with ${prefix}_, so it's a custom property`;
  return inference(
    meaning?.semanticType ?? null,
    meaning ? `${signal}. ${meaning.signal}` : signal,
    meaning?.confidence ?? "high",
    { structure: "type/CustomProperty" },
  );
}

function inferFromName(field: Field): FieldTypeInference | null {
  const name = nameOf(field);
  const rule = NAME_RULES.find(
    ({ pattern, baseTypes }) =>
      pattern.test(name) &&
      (baseTypes.length === 0 || hasBaseType(field, baseTypes)),
  );
  if (rule) {
    return inference(
      rule.type,
      t`Name matches ${rule.hint}`,
      rule.confidence ?? "high",
    );
  }
  if (hasBaseType(field, ["boolean"])) {
    return inference("type/Flag", t`A true/false column`);
  }
  return null;
}

function applyTableContext(
  field: Field,
  { fields, role }: FieldInferenceContext,
  base: FieldTypeInference | null,
): FieldTypeInference | null {
  if (role == null) {
    return base;
  }
  const name = nameOf(field);
  const addSignal = (signal: string) =>
    base ? `${base.signal}. ${signal}` : signal;

  if (isRoleA(role, "role/EventFact") && isDate(field)) {
    const dates = fields.filter((sibling) => isDate(sibling));
    const isOnlyDate = dates.length === 1;
    const isCreatedAt = base?.semanticType === "type/CreationTimestamp";
    if (isOnlyDate || isCreatedAt) {
      return {
        semanticType: base?.semanticType ?? null,
        facets: { ...base?.facets, time: "type/EventTimestamp" },
        signal: addSignal(t`On an event table, it's when the event happened`),
        confidence: base?.confidence ?? "high",
      };
    }
  }

  if (isRoleA(role, "role/HistoryDimension")) {
    if (HISTORY_ACTIVE_RE.test(name)) {
      return inference(
        "type/CurrentRowFlag",
        t`Marks the current version on a history table`,
      );
    }
    if (name === "id" && !isPK(field)) {
      return inference(
        "type/DurableKey",
        t`The ID that stays the same across versions`,
      );
    }
  }

  if (
    isRoleA(role, "role/Bridge") &&
    BRIDGE_WEIGHT_RE.test(name) &&
    hasBaseType(field, NUMBER)
  ) {
    return inference("type/Weight", t`An allocation weight on a link table`);
  }

  if (isRoleA(role, "role/Fact") && base?.semanticType === "type/NaturalKey") {
    return {
      ...base,
      semanticType: "type/DegenerateDimension",
      signal: addSignal(t`An identifier kept on a fact table`),
    };
  }

  if (
    isRoleA(role, "role/PeriodicSnapshotFact") &&
    base?.semanticType === "type/Balance"
  ) {
    return {
      ...base,
      signal: addSignal(t`On a periodic snapshot`),
      confidence: "high",
    };
  }

  return base;
}

function withoutRedundantFacets(
  result: FieldTypeInference | null,
): FieldTypeInference | null {
  if (result == null) {
    return null;
  }
  const facets = _.pick(
    result.facets,
    (type, facetKey) =>
      type != null &&
      type !== result.semanticType &&
      getFacetKey(type) === facetKey,
  );
  return { ...result, facets };
}
