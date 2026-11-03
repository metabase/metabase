export const PLANS = ["Starter", "Pro", "Enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const REGIONS = ["EMEA", "NA", "APAC"] as const;
export type Region = (typeof REGIONS)[number];

export const TODAY = "2026-11-03";

export const PLAN_COLORS: Record<Plan, string> = {
  Starter: "var(--mb-color-accent1)",
  Pro: "var(--mb-color-accent0)",
  Enterprise: "var(--mb-color-accent2)",
};

export const REGION_COLORS: Record<Region, string> = {
  EMEA: "var(--mb-color-accent4)",
  NA: "var(--mb-color-accent6)",
  APAC: "var(--mb-color-accent5)",
};

export type CustomerVersion = {
  customerKey: number;
  customerId: string;
  name: string;
  plan: Plan;
  region: Region;
  validFrom: string;
  validTo: string | null;
  isCurrent: boolean;
};

export type Order = {
  orderId: number;
  customerId: string;
  customerKey: number;
  orderDate: string;
  amount: number;
};

type VersionRow = [number, string, string, Plan, Region, string, string | null];

const VERSION_ROWS: VersionRow[] = [
  [1, "C-101", "Acme Corp", "Starter", "EMEA", "2025-01-04", "2025-06-12"],
  [2, "C-101", "Acme Corp", "Pro", "EMEA", "2025-06-12", "2026-02-01"],
  [3, "C-101", "Acme Corp", "Enterprise", "EMEA", "2026-02-01", null],
  [4, "C-102", "Birchwood", "Pro", "NA", "2025-02-10", null],
  [5, "C-103", "Cobalt Labs", "Starter", "APAC", "2025-03-01", "2025-09-20"],
  [6, "C-103", "Cobalt Labs", "Starter", "NA", "2025-09-20", null],
  [7, "C-104", "Dunmore", "Pro", "NA", "2025-04-15", "2026-05-01"],
  [8, "C-104", "Dunmore", "Starter", "NA", "2026-05-01", null],
  [9, "C-105", "Elm & Oak", "Starter", "EMEA", "2025-05-20", null],
  [10, "C-106", "Fjord AS", "Pro", "EMEA", "2025-07-01", "2026-03-15"],
  [11, "C-106", "Fjord AS", "Enterprise", "EMEA", "2026-03-15", null],
  [12, "C-107", "Gantry", "Starter", "APAC", "2025-08-08", "2026-01-10"],
  [13, "C-107", "Gantry", "Pro", "APAC", "2026-01-10", null],
  [14, "C-108", "Halcyon", "Pro", "NA", "2025-10-02", "2026-07-01"],
  [15, "C-108", "Halcyon", "Enterprise", "NA", "2026-07-01", null],
];

export const DIM_CUSTOMER: CustomerVersion[] = VERSION_ROWS.map(
  ([customerKey, customerId, name, plan, region, validFrom, validTo]) => ({
    customerKey,
    customerId,
    name,
    plan,
    region,
    validFrom,
    validTo,
    isCurrent: validTo === null,
  }),
);

export const CUSTOMER_IDS = [
  ...new Set(DIM_CUSTOMER.map((version) => version.customerId)),
];

export const isValidOn = (
  version: Pick<CustomerVersion, "validFrom" | "validTo">,
  date: string,
) =>
  version.validFrom <= date &&
  (version.validTo === null || date < version.validTo);

export const getVersions = (customerId: string) =>
  DIM_CUSTOMER.filter((version) => version.customerId === customerId);

export function getVersionOn(customerId: string, date: string) {
  return getVersions(customerId).find((version) => isValidOn(version, date));
}

export function getCurrentVersion(customerId: string) {
  return getVersions(customerId).find((version) => version.isCurrent);
}

export const getVersionsOn = (date: string) =>
  DIM_CUSTOMER.filter((version) => isValidOn(version, date));

export const countCustomers = (versions: CustomerVersion[]) =>
  new Set(versions.map((version) => version.customerId)).size;

const PLAN_PRICE_RANGE: Record<Plan, [number, number]> = {
  Starter: [60, 180],
  Pro: [420, 980],
  Enterprise: [2400, 4800],
};

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function generateOrders(): Order[] {
  const random = seededRandom(42);
  const orders: Order[] = [];
  let orderId = 5000;
  CUSTOMER_IDS.forEach((customerId) => {
    const [firstVersion] = getVersions(customerId);
    let orderDate = addDays(
      firstVersion.validFrom,
      6 + Math.floor(random() * 20),
    );
    while (orderDate <= "2026-10-31") {
      const version = getVersionOn(customerId, orderDate);
      if (version) {
        const [low, high] = PLAN_PRICE_RANGE[version.plan];
        orders.push({
          orderId: orderId++,
          customerId,
          customerKey: version.customerKey,
          orderDate,
          amount: Math.round(low + random() * (high - low)),
        });
      }
      orderDate = addDays(orderDate, 38 + Math.floor(random() * 40));
    }
  });
  return orders.sort((a, b) => a.orderDate.localeCompare(b.orderDate));
}

export const FCT_ORDERS = generateOrders();

export const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

export const ORDERS_TOTAL = sum(FCT_ORDERS.map((order) => order.amount));

export const formatMoney = (amount: number) =>
  `$${Math.round(amount).toLocaleString("en-US")}`;

export type JoinVersionMode = "at-event" | "current" | "every";

function getMatchedVersions(order: Order, mode: JoinVersionMode) {
  switch (mode) {
    case "every":
      return getVersions(order.customerId);
    case "current":
      return [getCurrentVersion(order.customerId)];
    case "at-event":
      return [getVersionOn(order.customerId, order.orderDate)];
  }
}

export function getRevenueByPlan(mode: JoinVersionMode) {
  const totals: Record<Plan, number> = { Starter: 0, Pro: 0, Enterprise: 0 };
  let matchedRowCount = 0;
  FCT_ORDERS.forEach((order) => {
    getMatchedVersions(order, mode).forEach((version) => {
      if (version) {
        matchedRowCount += 1;
        totals[version.plan] += order.amount;
      }
    });
  });
  return { totals, matchedRowCount, total: sum(Object.values(totals)) };
}

export type SnapshotRow = {
  customer_id: string;
  name: string;
  plan: Plan;
  region: Region;
  dbt_scd_id: string;
  dbt_valid_from: string;
  dbt_valid_to: string | null;
};

const fakeScdId = (seed: number) =>
  `${((seed * 2654435761) >>> 0).toString(16).padStart(8, "0")}…`;

const OVERLAPPING_VERSION_KEY = 7;

export const CUSTOMERS_SNAPSHOT: SnapshotRow[] = [
  ...DIM_CUSTOMER.map((version) => ({
    customer_id: version.customerId,
    name: version.name,
    plan: version.plan,
    region: version.region,
    dbt_scd_id: fakeScdId(version.customerKey),
    dbt_valid_from: version.validFrom,
    dbt_valid_to:
      version.customerKey === OVERLAPPING_VERSION_KEY
        ? "2026-05-10"
        : version.validTo,
  })),
  {
    customer_id: "C-102",
    name: "Birchwood",
    plan: "Pro",
    region: "NA",
    dbt_scd_id: fakeScdId(99),
    dbt_valid_from: "2026-08-03",
    dbt_valid_to: null,
  },
];
