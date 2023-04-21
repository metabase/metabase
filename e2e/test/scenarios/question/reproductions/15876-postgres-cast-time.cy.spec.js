import { restore } from "e2e/support/helpers";

const PG_DB_ID = 2;

const questionDetails = {
  native: {
    query: `select mytz as "ts", mytz::text as "tsAStext", state, mytz::time as "time - LOOK AT THIS COLUMN", mytz::time::text as "timeAStext", mytz::time(0) as "time(0) - ALL INCORRECT", mytz::time(3) as "time(3) - MOSTLY WORKING" from (
      select '2016-05-04 16:29:59.268160-04:00'::timestamptz as mytz, 'incorrect' AS state union all
      select '2016-05-04 16:29:59.412459-04:00'::timestamptz, 'good' union all
      select '2016-05-08 13:14:42.926221-04:00'::timestamptz, 'incorrect' union all
      select '2016-05-08 13:14:42.132020-04:00'::timestamptz, 'good' union all
      select '2016-05-10 07:38:58.987352-04:00'::timestamptz, 'incorrect' union all
      select '2016-05-10 07:38:58.001001-04:00'::timestamptz, 'good' union all
      select '2016-05-12 11:01:23.000000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2016-05-12 11:01:23.000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2016-05-12 11:01:23-04:00'::timestamptz, 'ALWAYS incorrect'
  )x`,
  },
  database: PG_DB_ID,
};

// time, time(0), time(3)
const castColumns = 3;

const correctValues = [
  {
    value: "1:29 PM",
    rows: 2,
  },
  {
    value: "10:14 AM",
    rows: 2,
  },
  {
    value: "4:38 AM",
    rows: 2,
  },
  {
    value: "8:01 AM",
    rows: 3,
  },
];

describe("issue 15876", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should correctly cast to `TIME` (metabase#15876)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.get(".Visualization").within(() => {
      correctValues.forEach(({ value, rows }) => {
        const count = rows * castColumns;

        cy.findAllByText(value).should("have.length", count);
      });
    });
  });
});
