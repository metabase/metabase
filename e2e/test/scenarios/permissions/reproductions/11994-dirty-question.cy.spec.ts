import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  COLLECTION_GROUP_ID,
  DATA_GROUP_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";
import { restore, visitQuestion } from "e2e/support/helpers";
import type {
  ConcreteFieldReference,
  Group,
  GroupId,
  Member,
  StructuredQuery,
  UserId,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;

const ORDERS_TOTAL_FIELD: ConcreteFieldReference = [
  "field",
  ORDERS.TOTAL,
  {
    "base-type": "type/Float",
  },
];

const CREATED_AT_MONTH_BREAKOUT: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const QUERY: StructuredQuery = {
  "source-table": ORDERS_ID,
  aggregation: [["count"], ["sum", ORDERS_TOTAL_FIELD]],
  breakout: [CREATED_AT_MONTH_BREAKOUT],
};

type Memberships = Map<Group["id"], Partial<Member>>;

describe("issue 11994", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(
      { database: SAMPLE_DB_ID, query: QUERY, display: "pivot" },
      { wrapId: true, idAlias: "pivotQuestionId" },
    );
    cy.createQuestion(
      { database: SAMPLE_DB_ID, query: QUERY, display: "combo" },
      { wrapId: true, idAlias: "comboQuestionId" },
    );
    removeUserMemberships(NORMAL_USER_ID, [DATA_GROUP_ID, COLLECTION_GROUP_ID]);
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "read" },
    });
    cy.signInAsNormalUser();
  });

  // TODO: report the issue with /pivot endpoint throwing an error
  it.skip("does not show raw data toggle for pivot questions (metabase#11994)", () => {
    // TODO: refactor visitQuestion to accept alias or id.
    cy.get<number>("@pivotQuestionId").then(pivotQuestionId => {
      visitQuestion(pivotQuestionId);
    });
    cy.icon("table2").should("not.exist");
    cy.findByTestId("qb-header").findByText(/Save/).should("not.exist");
  });

  it.only("does not offer to save combo question viewed in raw mode (metabase#11994)", () => {
    cy.get<number>("@comboQuestionId").then(pivotQuestionId => {
      visitQuestion(pivotQuestionId);
    });
    cy.location().as("questionLocation");
    cy.icon("table2").click();
    cy.get<Location>("@questionLocation").then(questionLocation => {
      cy.location("href").should("eq", questionLocation.href);
    });
    cy.findByTestId("qb-header").findByText(/Save/).should("not.exist");
  });
});

function removeUserMemberships(userId: UserId, groupIds: GroupId[]) {
  cy.request<Memberships>("GET", "/api/permissions/membership").then(
    ({ body: memberships }) => {
      Object.values(memberships)
        .flat()
        .filter(membership => {
          return (
            membership.user_id === userId &&
            groupIds.includes(membership.group_id)
          );
        })
        .forEach(membership => {
          cy.request(
            "DELETE",
            `/api/permissions/membership/${membership.membership_id}`,
          );
        });
    },
  );
}
