import _ from "underscore";

import type { RowValue } from "metabase-types/api";

import {
  DIM_CUSTOMER,
  PLANS,
  type Plan,
  REGIONS,
  type Region,
  addDays,
  seededRandom,
} from "./sample-data";

type CustomerState = {
  name: string;
  plan: Plan;
  region: Region;
  segment: string;
  accountManager: string;
  email: string;
};

type CustomerTimeline = {
  customerId: string;
  numericId: number;
  createdAt: string;
  versions: { validFrom: string; state: CustomerState }[];
};

const LAST_CHANGE_DATE = "2026-10-28";
const GENERATED_CUSTOMER_COUNT = 132;
const SNAPSHOT_CUSTOMER_COUNT = 90;
const ACCOUNT_COUNT = 64;

const SEGMENTS = ["SMB", "Mid-market", "Enterprise"];
const ACCOUNT_MANAGERS = [
  "Ana Ruiz",
  "Bo Lindqvist",
  "Chen Wei",
  "Dee Okafor",
  "Eli Brandt",
  "Fay Moreau",
  "Gus Tanaka",
  "Hana Novak",
];
const NAME_STARTS = [
  "Alder",
  "Basalt",
  "Cedar",
  "Delta",
  "Ember",
  "Falcon",
  "Granite",
  "Harbor",
  "Iris",
  "Juniper",
  "Kestrel",
  "Lumen",
  "Maple",
  "Nimbus",
  "Onyx",
  "Pioneer",
  "Quarry",
  "Ridge",
  "Summit",
  "Tidal",
  "Umber",
  "Vale",
];
const NAME_ENDS = [
  "Analytics",
  "Foods",
  "Health",
  "Logistics",
  "Media",
  "Robotics",
  "Studio",
  "Systems",
];
const INDUSTRIES = [
  "Software",
  "Retail",
  "Healthcare",
  "Financial services",
  "Manufacturing",
];
const ACCOUNT_TYPES = ["Prospect", "Customer", "Partner", "Former customer"];
const OWNER_IDS = ["0055g00000AbC1", "0055g00000DeF2", "0055g00000GhI3"];

const pick = <T>(random: () => number, items: readonly T[]) =>
  items[Math.floor(random() * items.length)];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, "");

function getHandcraftedTimelines(): CustomerTimeline[] {
  const byCustomer = _.groupBy(DIM_CUSTOMER, (version) => version.customerId);
  return Object.entries(byCustomer).map(([customerId, versions], index) => {
    const segment = SEGMENTS[index % SEGMENTS.length];
    return {
      customerId,
      numericId: 1001 + index,
      createdAt: versions[0].validFrom,
      versions: versions.map((version, versionIndex) => ({
        validFrom: version.validFrom,
        state: {
          name: version.name,
          plan: version.plan,
          region: version.region,
          segment: version.plan === "Enterprise" ? "Enterprise" : segment,
          accountManager:
            ACCOUNT_MANAGERS[(index + versionIndex) % ACCOUNT_MANAGERS.length],
          email: `billing@${slug(version.name)}.com`,
        },
      })),
    };
  });
}

function nextPlan(random: () => number, plan: Plan): Plan {
  const index = PLANS.indexOf(plan);
  const isUpgrade = random() < 0.8;
  const target = isUpgrade ? index + 1 : index - 1;
  return PLANS[Math.min(PLANS.length - 1, Math.max(0, target))];
}

function changeState(random: () => number, state: CustomerState) {
  const roll = random();
  if (roll < 0.55) {
    return { ...state, plan: nextPlan(random, state.plan) };
  }
  if (roll < 0.85) {
    return { ...state, accountManager: pick(random, ACCOUNT_MANAGERS) };
  }
  if (roll < 0.93) {
    return { ...state, region: pick(random, REGIONS) };
  }
  if (roll < 0.98) {
    return { ...state, segment: pick(random, SEGMENTS) };
  }
  return { ...state, name: `${state.name} Group` };
}

function generateTimelines(): CustomerTimeline[] {
  const random = seededRandom(7);
  return _.range(GENERATED_CUSTOMER_COUNT).map((index) => {
    const numericId = 1009 + index;
    const name = `${NAME_STARTS[index % NAME_STARTS.length]} ${NAME_ENDS[Math.floor(index / NAME_STARTS.length) % NAME_ENDS.length]}`;
    const createdAt = addDays("2024-01-02", Math.floor(random() * 940));
    const changeCount = pick(random, [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4]);
    const initial: CustomerState = {
      name,
      plan: pick(random, ["Starter", "Starter", "Pro"] as const),
      region: pick(random, REGIONS),
      segment: pick(random, SEGMENTS),
      accountManager: pick(random, ACCOUNT_MANAGERS),
      email: `ops@${slug(name)}.io`,
    };
    const versions = _.range(changeCount).reduce(
      (versions) => {
        const last = versions[versions.length - 1];
        const validFrom = addDays(
          last.validFrom,
          30 + Math.floor(random() * 260),
        );
        return validFrom > LAST_CHANGE_DATE
          ? versions
          : [
              ...versions,
              { validFrom, state: changeState(random, last.state) },
            ];
      },
      [{ validFrom: createdAt, state: initial }],
    );
    return { customerId: `C-${numericId}`, numericId, createdAt, versions };
  });
}

const TIMELINES = [...getHandcraftedTimelines(), ...generateTimelines()];

type Row = Record<string, RowValue>;

const timeOf = (date: string, minutes: number) =>
  `${date}T${String(2 + (minutes % 20)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

function getDimCustomerRows(): Row[] {
  let customerKey = 0;
  return TIMELINES.flatMap((timeline) =>
    timeline.versions.map((version, index) => {
      const next = timeline.versions[index + 1];
      customerKey += 1;
      const hasGap = timeline.customerId === "C-107" && index === 0;
      const hasStaleFlag = timeline.customerId === "C-104" && index === 0;
      const validTo = next ? addDays(next.validFrom, hasGap ? -3 : 0) : null;
      return {
        customer_sk: customerKey,
        customer_id: timeline.customerId,
        name: version.state.name,
        plan: version.state.plan,
        region: version.state.region,
        segment: version.state.segment,
        account_manager: version.state.accountManager,
        email: version.state.email,
        created_at: timeline.createdAt,
        valid_from: version.validFrom,
        valid_to: validTo,
        is_current: validTo == null || hasStaleFlag,
      };
    }),
  );
}

function snapshotVersions(timeline: CustomerTimeline) {
  return timeline.versions.filter(
    (version, index) =>
      index === 0 ||
      !_.isEqual(
        _.pick(timeline.versions[index - 1].state, "name", "plan", "region"),
        _.pick(version.state, "name", "plan", "region"),
      ),
  );
}

const scdId = (seed: string) =>
  _.range(4)
    .map((part) =>
      Math.abs(
        [...`${seed}:${part}`].reduce(
          (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
          2166136261,
        ),
      )
        .toString(16)
        .padStart(8, "0"),
    )
    .join("");

const DELETED_AT = "2026-09-14";

function getSnapshotValidTo({
  validFrom,
  validTo,
  overlapDays,
  isDeleted,
}: {
  validFrom: string;
  validTo: string | null;
  overlapDays: number;
  isDeleted: boolean;
}) {
  if (validTo != null) {
    return overlapDays > 0
      ? `${addDays(validTo.slice(0, 10), overlapDays)}${validTo.slice(10)}`
      : validTo;
  }
  if (isDeleted) {
    return timeOf(
      validFrom < DELETED_AT ? DELETED_AT : addDays(validFrom, 5),
      9,
    );
  }
  return null;
}

function getCustomersSnapshotRows(): Row[] {
  return TIMELINES.slice(0, SNAPSHOT_CUSTOMER_COUNT).flatMap(
    (timeline, customerIndex) => {
      const versions = snapshotVersions(timeline);
      const rows = versions.map((version, index): Row => {
        const next = versions[index + 1];
        const validFrom = timeOf(version.validFrom, customerIndex + index);
        const overlapDays = timeline.customerId === "C-104" && next ? 9 : 0;
        const isDeleted = customerIndex === 49 && next == null;
        const validTo = next
          ? timeOf(next.validFrom, customerIndex + index + 1)
          : null;
        return {
          id: timeline.numericId,
          name: version.state.name,
          plan: version.state.plan,
          region: version.state.region,
          email: version.state.email,
          updated_at: validFrom,
          dbt_scd_id: scdId(`${timeline.numericId}:${validFrom}`),
          dbt_updated_at: validFrom,
          dbt_valid_from: validFrom,
          dbt_valid_to: getSnapshotValidTo({
            validFrom: version.validFrom,
            validTo,
            overlapDays,
            isDeleted,
          }),
        };
      });
      if (timeline.customerId !== "C-102") {
        return rows;
      }
      const latest = rows[rows.length - 1];
      const duplicateFrom = timeOf("2026-10-06", 3);
      return [
        ...rows,
        {
          ...latest,
          dbt_scd_id: scdId(`${timeline.numericId}:${duplicateFrom}`),
          dbt_updated_at: duplicateFrom,
          dbt_valid_from: duplicateFrom,
          updated_at: duplicateFrom,
        },
      ];
    },
  );
}

function getAccountHistoryRows(): Row[] {
  const random = seededRandom(11);
  return _.range(ACCOUNT_COUNT).flatMap((index) => {
    const id = `0015g00000${(48213 + index * 37).toString(36).toUpperCase()}QA`;
    const name = `${NAME_STARTS[(index * 5) % NAME_STARTS.length]} ${NAME_ENDS[(index * 3) % NAME_ENDS.length]}`;
    const changeCount = pick(random, [0, 1, 1, 2, 2, 3, 5]);
    const starts = _.range(changeCount).reduce(
      (dates) => [
        ...dates,
        addDays(dates[dates.length - 1], 20 + Math.floor(random() * 200)),
      ],
      [addDays("2024-03-01", Math.floor(random() * 700))],
    );
    const validStarts = starts.filter((date) => date <= LAST_CHANGE_DATE);
    const industry = pick(random, INDUSTRIES);
    return validStarts.map((start, versionIndex): Row => {
      const next = validStarts[versionIndex + 1];
      const startTime = `${timeOf(start, index + versionIndex)}.000`;
      const endTime = next
        ? new Date(Date.parse(`${timeOf(next, index + versionIndex + 1)}Z`) - 1)
            .toISOString()
            .slice(0, 23)
        : "9999-12-31T23:59:59.999";
      return {
        id,
        name,
        type: ACCOUNT_TYPES[Math.min(versionIndex, ACCOUNT_TYPES.length - 2)],
        industry,
        owner_id: OWNER_IDS[(index + versionIndex) % OWNER_IDS.length],
        annual_revenue: (Math.floor(random() * 90) + 10) * 100000,
        _fivetran_start: startTime,
        _fivetran_end: endTime,
        _fivetran_active: next == null,
        _fivetran_synced: `${LAST_CHANGE_DATE}T04:00:00.000`,
      };
    });
  });
}

export const DIM_CUSTOMER_ROWS = getDimCustomerRows();
export const CUSTOMERS_SNAPSHOT_ROWS = getCustomersSnapshotRows();
export const ACCOUNT_HISTORY_ROWS = getAccountHistoryRows();
