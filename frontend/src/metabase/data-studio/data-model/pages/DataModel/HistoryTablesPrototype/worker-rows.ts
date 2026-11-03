import _ from "underscore";

import type { RowValue } from "metabase-types/api";

import { addDays, seededRandom } from "./sample-data";

type Row = Record<string, RowValue>;

type WorkerState = {
  legalName: string;
  businessTitle: string;
  department: string;
  location: string;
  managerId: string;
  positionId: string;
};

const WORKER_COUNT = 220;
const SUBSCRIPTION_COUNT = 90;
const LAST_CHANGE_DATE = "2026-10-28";
const FIRST_NAMES = [
  "Amara",
  "Bastian",
  "Chiara",
  "Dmitri",
  "Elif",
  "Farid",
  "Greta",
  "Hiro",
  "Ines",
  "Jonas",
  "Keziah",
  "Lior",
  "Mei",
  "Nils",
  "Oona",
  "Priya",
  "Quentin",
  "Rosa",
  "Soren",
  "Tamsin",
];
const LAST_NAMES = [
  "Abara",
  "Brandt",
  "Castillo",
  "Dahl",
  "Eriksen",
  "Fujita",
  "Gallo",
  "Haddad",
  "Iversen",
  "Jovanovic",
  "Kowalski",
];
const DEPARTMENTS = ["Engineering", "Sales", "Finance", "People", "Support"];
const TITLES: Record<string, string[]> = {
  Engineering: [
    "Engineer",
    "Senior Engineer",
    "Staff Engineer",
    "Engineering Manager",
  ],
  Sales: ["Account Executive", "Senior Account Executive", "Sales Manager"],
  Finance: ["Analyst", "Senior Analyst", "Controller"],
  People: ["People Partner", "Senior People Partner", "Head of People"],
  Support: ["Support Specialist", "Support Lead", "Support Manager"],
};
const LOCATIONS = ["Berlin", "Lisbon", "New York", "Singapore", "Toronto"];
const STALE_FLAG_WORKERS = new Set([7, 63, 141]);
const TERMINATED_WORKERS = new Set([12, 88, 150, 201]);
const PLANS = ["Starter", "Team", "Business", "Enterprise"];

const pick = <T>(random: () => number, items: readonly T[]) =>
  items[Math.floor(random() * items.length)];

function changeWorker(random: () => number, state: WorkerState): WorkerState {
  const roll = random();
  if (roll < 0.45) {
    const titles = TITLES[state.department];
    const index = titles.indexOf(state.businessTitle);
    return {
      ...state,
      businessTitle: titles[Math.min(titles.length - 1, index + 1)],
      positionId: `P-${Math.floor(random() * 9000 + 1000)}`,
    };
  }
  if (roll < 0.65) {
    return { ...state, managerId: `W-${1000 + Math.floor(random() * 40)}` };
  }
  if (roll < 0.8) {
    return { ...state, location: pick(random, LOCATIONS) };
  }
  if (roll < 0.95) {
    const department = pick(random, DEPARTMENTS);
    return {
      ...state,
      department,
      businessTitle: TITLES[department][0],
      positionId: `P-${Math.floor(random() * 9000 + 1000)}`,
    };
  }
  return {
    ...state,
    legalName: `${state.legalName}-${pick(random, LAST_NAMES)}`,
  };
}

function getWorkerPositionRows(): Row[] {
  const random = seededRandom(23);
  let recordId = 50000;
  return _.range(WORKER_COUNT).flatMap((index) => {
    const department = pick(random, DEPARTMENTS);
    const hiredOn = addDays("2021-01-04", Math.floor(random() * 1900));
    const initial: WorkerState = {
      legalName: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]}`,
      businessTitle: TITLES[department][0],
      department,
      location: pick(random, LOCATIONS),
      managerId: `W-${1000 + Math.floor(random() * 40)}`,
      positionId: `P-${Math.floor(random() * 9000 + 1000)}`,
    };
    const changeCount = pick(random, [0, 1, 1, 2, 2, 3, 4]);
    const versions = _.range(changeCount).reduce(
      (versions) => {
        const last = versions[versions.length - 1];
        const effective = addDays(
          last.effective,
          60 + Math.floor(random() * 300),
        );
        return effective > LAST_CHANGE_DATE
          ? versions
          : [
              ...versions,
              { effective, state: changeWorker(random, last.state) },
            ];
      },
      [{ effective: hiredOn, state: initial }],
    );
    const workerId = `W-${21000 + index}`;
    const isTerminated = TERMINATED_WORKERS.has(index);
    return versions.map((version, versionIndex): Row => {
      const next = versions[versionIndex + 1];
      const terminatedOn = isTerminated && next == null;
      const terminationDate = terminatedOn
        ? addDays(version.effective, 120)
        : null;
      const endDate = next ? next.effective : terminationDate;
      const hasStaleFlag =
        STALE_FLAG_WORKERS.has(index) && versionIndex === versions.length - 2;
      recordId += 1;
      return {
        position_record_id: recordId,
        worker_id: workerId,
        position_id: version.state.positionId,
        legal_name: version.state.legalName,
        business_title: version.state.businessTitle,
        department: version.state.department,
        location: version.state.location,
        manager_id: version.state.managerId,
        hire_date: hiredOn,
        effective_date: version.effective,
        end_date: endDate,
        is_current: endDate == null || hasStaleFlag,
        position_version: versionIndex + 1,
        _fivetran_synced: `${LAST_CHANGE_DATE}T05:00:00`,
      };
    });
  });
}

function getSubscriptionHistoryRows(): Row[] {
  const random = seededRandom(31);
  return _.range(SUBSCRIPTION_COUNT).flatMap((index) => {
    const changeCount = pick(random, [0, 1, 1, 2, 3]);
    const starts = _.range(changeCount).reduce(
      (dates) => [
        ...dates,
        addDays(dates[dates.length - 1], 25 + Math.floor(random() * 220)),
      ],
      [addDays("2024-06-01", Math.floor(random() * 600))],
    );
    let planIndex = Math.floor(random() * 2);
    let seats = 3 + Math.floor(random() * 20);
    return starts
      .filter((date) => date <= LAST_CHANGE_DATE)
      .map((date, versionIndex): Row => {
        if (versionIndex > 0) {
          planIndex = Math.min(
            PLANS.length - 1,
            planIndex + (random() < 0.6 ? 1 : 0),
          );
          seats += Math.floor(random() * 12) - 2;
        }
        return {
          id: 7000 + index,
          updated_at: `${date}T${String(8 + (index % 10)).padStart(2, "0")}:15:00`,
          plan: PLANS[planIndex],
          seats,
          status: "active",
          mrr: seats * (planIndex + 1) * 12,
        };
      });
  });
}

export const WORKER_POSITION_ROWS = getWorkerPositionRows();
export const SUBSCRIPTION_HISTORY_ROWS = getSubscriptionHistoryRows();
