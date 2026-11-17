import _ from "underscore";

import type { RowValue } from "metabase-types/api";

import { addDays, seededRandom } from "./sample-data";
import { SUBSCRIPTION_HISTORY_ROWS, WORKER_POSITION_ROWS } from "./worker-rows";

type Row = Record<string, RowValue>;

const TIME_OFF_COUNT = 320;
const EXPENSE_COUNT = 420;
const EXAMPLE_DEPARTMENT = "Engineering";
const EXAMPLE_PLAN = "Business";

const text = (value: RowValue | undefined) =>
  value == null ? "" : String(value);
const numberOf = (value: RowValue | undefined) => Number(value ?? 0);

const isValidOn = (row: Row, date: string) =>
  text(row.effective_date) <= date &&
  (row.end_date == null || date < text(row.end_date));

const workerIds = _.uniq(
  WORKER_POSITION_ROWS.map((row) => text(row.worker_id)),
);
const versionsByWorker = _.groupBy(WORKER_POSITION_ROWS, (row) =>
  text(row.worker_id),
);
const currentRows = WORKER_POSITION_ROWS.filter((row) => row.end_date == null);

function versionOn(workerId: string, date: string) {
  return versionsByWorker[workerId]?.find((row) => isValidOn(row, date));
}

function makeEvents() {
  const random = seededRandom(57);
  const timeOff = _.range(TIME_OFF_COUNT).flatMap((index) => {
    const workerId = workerIds[Math.floor(random() * workerIds.length)];
    const first = versionsByWorker[workerId][0];
    const startsOn = addDays(
      text(first.effective_date),
      20 + Math.floor(random() * 900),
    );
    const version = versionOn(workerId, startsOn);
    return version
      ? [
          {
            request_id: 30000 + index,
            worker_id: workerId,
            position_record_id: version.position_record_id,
            starts_on: startsOn,
            days: 1 + Math.floor(random() * 9),
          },
        ]
      : [];
  });
  const expenses = _.range(EXPENSE_COUNT).flatMap((index) => {
    const workerId = workerIds[Math.floor(random() * workerIds.length)];
    const first = versionsByWorker[workerId][0];
    const submittedAt = addDays(
      text(first.effective_date),
      10 + Math.floor(random() * 1000),
    );
    return versionOn(workerId, submittedAt)
      ? [
          {
            report_id: 60000 + index,
            worker_id: workerId,
            submitted_at: submittedAt,
            amount: 40 + Math.floor(random() * 900),
          },
        ]
      : [];
  });
  return { timeOff, expenses };
}

const { timeOff, expenses } = makeEvents();

const departmentOfRecord = new Map(
  WORKER_POSITION_ROWS.map((row) => [
    numberOf(row.position_record_id),
    text(row.department),
  ]),
);

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

const latestSubscriptions = Object.values(
  _.groupBy(SUBSCRIPTION_HISTORY_ROWS, (row) => text(row.id)),
).map((rows) => _.sortBy(rows, (row) => text(row.updated_at)).at(-1));

export const AGENT_NUMBERS = {
  recordCount: WORKER_POSITION_ROWS.length,
  workerCount: workerIds.length,
  currentWorkerCount: _.uniq(currentRows.map((row) => text(row.worker_id)))
    .length,
  department: EXAMPLE_DEPARTMENT,
  departmentRecordCount: WORKER_POSITION_ROWS.filter(
    (row) => row.department === EXAMPLE_DEPARTMENT,
  ).length,
  departmentCurrentCount: _.uniq(
    currentRows
      .filter((row) => row.department === EXAMPLE_DEPARTMENT)
      .map((row) => text(row.worker_id)),
  ).length,
  timeOffDays: sum(timeOff.map((row) => row.days)),
  timeOffDaysInDepartment: sum(
    timeOff
      .filter(
        (row) =>
          departmentOfRecord.get(numberOf(row.position_record_id)) ===
          EXAMPLE_DEPARTMENT,
      )
      .map((row) => row.days),
  ),
  timeOffDaysInDepartmentFannedOut: sum(
    timeOff.map(
      (row) =>
        row.days *
        versionsByWorker[row.worker_id].filter(
          (version) => version.department === EXAMPLE_DEPARTMENT,
        ).length,
    ),
  ),
  expenseInDepartmentFannedOut: sum(
    expenses.map(
      (row) =>
        row.amount *
        versionsByWorker[row.worker_id].filter(
          (version) => version.department === EXAMPLE_DEPARTMENT,
        ).length,
    ),
  ),
  expenseTotal: sum(expenses.map((row) => row.amount)),
  expenseInDepartmentNow: sum(
    expenses
      .filter(
        (row) =>
          versionsByWorker[row.worker_id].find(
            (version) => version.end_date == null,
          )?.department === EXAMPLE_DEPARTMENT,
      )
      .map((row) => row.amount),
  ),
  expenseInDepartmentThen: sum(
    expenses
      .filter(
        (row) =>
          versionOn(row.worker_id, row.submitted_at)?.department ===
          EXAMPLE_DEPARTMENT,
      )
      .map((row) => row.amount),
  ),
  plan: EXAMPLE_PLAN,
  planRecordCount: SUBSCRIPTION_HISTORY_ROWS.filter(
    (row) => row.plan === EXAMPLE_PLAN,
  ).length,
  planLatestCount: latestSubscriptions.filter(
    (row) => row?.plan === EXAMPLE_PLAN,
  ).length,
};
