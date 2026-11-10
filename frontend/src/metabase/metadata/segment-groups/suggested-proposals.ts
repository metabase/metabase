import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { singularize } from "metabase/utils/formatting";
import { isCategory, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import type {
  SegmentGroupProposal,
  SegmentGroupProposalMember,
} from "./inference";

type ValueBucket = {
  label: string;
  segmentName: string;
  matches: string[];
};

export type ValueGroupingRule = {
  key: string;
  columnPattern: RegExp;
  getName: () => string;
  describe: (field: Field) => string;
  buckets: () => ValueBucket[];
};

const VALUE_GROUPING_RULES: ValueGroupingRule[] = [
  {
    key: "acquisition-channel",
    columnPattern:
      /(^|_)(source|channel|utm_source|lead_?src(_c)?|lead_source|referrer)$/,
    getName: () => t`Acquisition channel`,
    describe: (field) =>
      t`${field.display_name} values grouped by how people found you`,
    buckets: () => [
      {
        label: t`Paid ads`,
        segmentName: t`Came from paid ads`,
        matches: [
          "facebook",
          "google",
          "twitter",
          "linkedin",
          "bing",
          "cpc",
          "ads",
          "paid",
        ],
      },
      {
        label: t`Organic`,
        segmentName: t`Came organically`,
        matches: ["organic", "seo", "direct", "web", "search"],
      },
      {
        label: t`Partners`,
        segmentName: t`Came through partners`,
        matches: ["affiliate", "partner", "referral"],
      },
      {
        label: t`Events`,
        segmentName: t`Came from events`,
        matches: ["event", "webinar", "conference"],
      },
      {
        label: t`Outbound`,
        segmentName: t`Came from outbound sales`,
        matches: ["outbound", "cold"],
      },
    ],
  },
  {
    key: "region",
    columnPattern: /(^|_)(country|country_code|billing_country)$/,
    getName: () => t`Region`,
    describe: (field) => t`${field.display_name} values grouped into regions`,
    buckets: () => [
      {
        label: t`North America`,
        segmentName: t`In North America`,
        matches: ["us", "usa", "united states", "ca", "canada", "mx", "mexico"],
      },
      {
        label: t`Europe`,
        segmentName: t`In Europe`,
        matches: [
          "de",
          "germany",
          "gb",
          "uk",
          "united kingdom",
          "fr",
          "france",
          "ua",
          "ukraine",
          "es",
          "spain",
          "it",
          "italy",
          "nl",
          "pl",
          "se",
        ],
      },
      {
        label: t`Asia-Pacific`,
        segmentName: t`In Asia-Pacific`,
        matches: [
          "jp",
          "japan",
          "in",
          "india",
          "au",
          "australia",
          "cn",
          "sg",
          "kr",
          "nz",
        ],
      },
      {
        label: t`Latin America`,
        segmentName: t`In Latin America`,
        matches: ["br", "brazil", "ar", "argentina", "cl", "co"],
      },
    ],
  },
  {
    key: "plan-tier",
    columnPattern: /(^|_)(plan|tier|current_plan|subscription_plan)$/,
    getName: () => t`Plan tier`,
    describe: (field) =>
      t`${field.display_name} values grouped from self-serve to enterprise`,
    buckets: () => [
      {
        label: t`Self-serve`,
        segmentName: t`On a self-serve plan`,
        matches: ["free", "starter", "basic", "trial", "hobby"],
      },
      {
        label: t`Paid`,
        segmentName: t`On a paid plan`,
        matches: ["pro", "premium", "business", "team", "growth"],
      },
      {
        label: t`Enterprise`,
        segmentName: t`On an enterprise plan`,
        matches: ["enterprise"],
      },
    ],
  },
];

const SIZE_COLUMN_PATTERN = /(^|_)(total|subtotal|amount|price|list_price)$/;
const REVENUE_COLUMN_PATTERN = /(^|_)(revenue|mrr|arr|annual_revenue)$/;

const SHORT_CODE_LENGTH = 3;

const nameOf = (field: Field) => field.name.toLowerCase();
const idOf = (field: Field) => getRawTableFieldId(field);

export type SuggestedValueGroupingCandidate = {
  field: Field;
  rule: ValueGroupingRule;
};

export function getSuggestedValueGroupingCandidates(
  fields: Field[],
): SuggestedValueGroupingCandidate[] {
  return fields.flatMap((field) => {
    if (!isCategory(field) || isNumeric(field)) {
      return [];
    }
    const rule = VALUE_GROUPING_RULES.find(({ columnPattern }) =>
      columnPattern.test(nameOf(field)),
    );
    return rule ? [{ field, rule }] : [];
  });
}

export function getSuggestedValueGroupingKey({
  field,
  rule,
}: SuggestedValueGroupingCandidate): string {
  return `suggested:${rule.key}:${idOf(field)}`;
}

export function getSuggestedValueGroupingProposal(
  candidate: SuggestedValueGroupingCandidate,
  values: string[],
): SegmentGroupProposal | null {
  const { field, rule } = candidate;
  const bucketOf = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return rule
      .buckets()
      .find(({ matches }) =>
        matches.some(
          (match) =>
            normalized === match ||
            (match.length > SHORT_CODE_LENGTH && normalized.includes(match)),
        ),
      );
  };
  const members = rule
    .buckets()
    .flatMap((bucket): SegmentGroupProposalMember[] => {
      const bucketValues = values.filter(
        (value) => bucketOf(value)?.label === bucket.label,
      );
      return bucketValues.length > 0
        ? [
            {
              label: bucket.label,
              segmentName: bucket.segmentName,
              condition: {
                fieldId: idOf(field),
                operator: "in",
                values: bucketValues,
              },
            },
          ]
        : [];
    });
  if (members.length < 2) {
    return null;
  }
  return {
    key: getSuggestedValueGroupingKey(candidate),
    name: rule.getName(),
    source: "suggested",
    sourceFieldId: idOf(field),
    members,
    other: values.some((value) => bucketOf(value) == null),
    signal: rule.describe(field),
  };
}

export function getSuggestedBandProposals(
  table: Pick<Table, "display_name">,
  fields: Field[],
): SegmentGroupProposal[] {
  const rows = table.display_name.toLowerCase();
  return fields.flatMap((field): SegmentGroupProposal[] => {
    const quartiles = field.fingerprint?.type?.["type/Number"];
    const q1 = quartiles?.q1;
    const q3 = quartiles?.q3;
    const isSize = SIZE_COLUMN_PATTERN.test(nameOf(field));
    const isRevenue = REVENUE_COLUMN_PATTERN.test(nameOf(field));
    if (
      !isNumeric(field) ||
      (!isSize && !isRevenue) ||
      q1 == null ||
      q3 == null ||
      q1 >= q3
    ) {
      return [];
    }
    const low = roundForLabel(q1);
    const high = roundForLabel(q3);
    const fieldId = idOf(field);
    return [
      {
        key: `suggested:bands:${fieldId}`,
        name: isSize
          ? t`${singularize(table.display_name)} size`
          : t`${field.display_name} band`,
        source: "suggested",
        sourceFieldId: fieldId,
        members: [
          {
            label: t`Small`,
            segmentName: t`Small ${rows}`,
            condition: { fieldId, operator: "<", value: low },
          },
          {
            label: t`Medium`,
            segmentName: t`Medium ${rows}`,
            condition: { fieldId, operator: "between", min: low, max: high },
          },
          {
            label: t`Large`,
            segmentName: t`Large ${rows}`,
            condition: { fieldId, operator: ">", value: high },
          },
        ],
        other: false,
        signal: t`${field.display_name} split at its quartiles: under ${low}, ${low} to ${high}, over ${high}`,
      },
    ];
  });
}

function roundForLabel(value: number): number {
  if (value === 0) {
    return 0;
  }
  const magnitude = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
  return Math.round(value / magnitude) * magnitude;
}
