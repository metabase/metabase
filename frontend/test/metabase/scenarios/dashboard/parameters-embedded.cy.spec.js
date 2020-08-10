import {
  signInAsAdmin,
  signOut,
  restore,
  popover,
  withSampleDataset,
} from "__support__/cypress";

const METABASE_SECRET_KEY =
  "24134bd93e081773fb178e8e1abb4e8a973822f7e19c872bd92c8d5a122ef63f";

// Calling jwt.sign was failing in cypress (in browser issue maybe?). These
// tokens just hard code dashboardId=2 and questionId=3
const QUESTION_JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6eyJxdWVzdGlvbiI6M30sInBhcmFtcyI6e30sImlhdCI6MTU3OTU1OTg3NH0.alV205oYgfyWuwLNQSLVgfHop1tpevX4C26Xal-bia8";
const DASHBOARD_JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjJ9LCJwYXJhbXMiOnt9LCJpYXQiOjE1Nzk1NjAxMTF9.LjOiTp4p2lV3b2VpSjcg0GuSaE2O0xhHwc59JDYcBJI";

// NOTE: some overlap with parameters.cy.spec.js

describe("scenarios > dashboard > parameters-embedded", () => {
  let dashboardId, questionId, dashcardId;

  before(() => {
    restore();
    signInAsAdmin();

    withSampleDataset(SAMPLE_DATASET => {
      cy.log(SAMPLE_DATASET);
      const { ORDERS, PEOPLE } = SAMPLE_DATASET;
      cy.request("POST", `/api/field/${ORDERS.USER_ID}/dimension`, {
        type: "external",
        name: "User ID",
        human_readable_field_id: PEOPLE.NAME,
      });

      [ORDERS.USER_ID, PEOPLE.NAME, PEOPLE.ID].forEach(id =>
        cy.request("PUT", `/api/field/${id}`, { has_field_values: "search" }),
      );

      createQuestion(SAMPLE_DATASET).then(res => {
        questionId = res.body.id;
        createDashboard().then(res => {
          dashboardId = res.body.id;
          addCardToDashboard({ dashboardId, questionId }).then(res => {
            dashcardId = res.body.id;
            mapParameters({ dashboardId, questionId, dashcardId });
          });
        });
      });
    });

    cy.request("PUT", `/api/setting/embedding-secret-key`, {
      value: METABASE_SECRET_KEY,
    });
    cy.request("PUT", `/api/setting/enable-embedding`, { value: true });
    cy.request("PUT", `/api/setting/enable-public-sharing`, { value: true });
  });

  describe("private question", () => {
    beforeEach(signInAsAdmin);

    sharedParametersTests(() => {
      cy.visit(`/question/${questionId}`);
      // wait for question to load/run
      cy.contains("Test Question");
      cy.contains("2,500");
    });
  });

  describe("public question", () => {
    let uuid;
    before(() => {
      signInAsAdmin();
      cy.request("POST", `/api/card/${questionId}/public_link`).then(
        res => (uuid = res.body.uuid),
      );
      signOut();
    });

    sharedParametersTests(() => {
      cy.visit(`/public/question/${uuid}`);
      // wait for question to load/run
      cy.contains("Test Question");
      cy.contains("2,500");
    });
  });

  describe("embedded question", () => {
    before(() => {
      signInAsAdmin();
      cy.request("PUT", `/api/card/${questionId}`, {
        embedding_params: {
          id: "enabled",
          name: "enabled",
          source: "enabled",
          user_id: "enabled",
        },
        enable_embedding: true,
      });
      signOut();
    });

    sharedParametersTests(() => {
      cy.visit(`/embed/question/${QUESTION_JWT_TOKEN}`);
      // wait for question to load/run
      cy.contains("Test Question");
      cy.contains("2,500");
    });
  });

  describe("private dashboard", () => {
    beforeEach(signInAsAdmin);

    sharedParametersTests(() => {
      cy.visit(`/dashboard/${dashboardId}`);
      // wait for question to load/run
      cy.contains("Test Dashboard");
      cy.contains("2,500");
    });
  });

  describe("public dashboard", () => {
    let uuid;
    before(() => {
      signInAsAdmin();
      cy.request("POST", `/api/dashboard/${dashboardId}/public_link`).then(
        res => (uuid = res.body.uuid),
      );
      signOut();
    });

    sharedParametersTests(() => {
      cy.visit(`/public/dashboard/${uuid}`);
      // wait for question to load/run
      cy.contains("Test Dashboard");
      cy.contains("2,500");
    });
  });

  describe("embedded dashboard", () => {
    before(() => {
      signInAsAdmin();
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        embedding_params: {
          id: "enabled",
          name: "enabled",
          source: "enabled",
          user_id: "enabled",
        },
        enable_embedding: true,
      });
      signOut();
    });

    sharedParametersTests(() => {
      cy.visit(`/embed/dashboard/${DASHBOARD_JWT_TOKEN}`);
      // wait for question to load/run
      cy.contains("Test Dashboard");
      cy.contains("2,500");
    });
  });
});

function sharedParametersTests(visitUrl) {
  it("should allow searching PEOPLE.ID by PEOPLE.NAME", () => {
    visitUrl();
    cy.contains("Id").click();
    popover()
      .find('[placeholder="Search by Name or enter an ID"]')
      .type("Aly");
    popover().contains("Alycia Collins - 541");
  });

  it("should allow searching PEOPLE.NAME by PEOPLE.NAME", () => {
    visitUrl();
    cy.contains("Name").click();
    popover()
      .find('[placeholder="Search by Name"]')
      .type("Aly");
    popover().contains("Alycia Collins");
  });

  it("should show values for PEOPLE.SOURCE", () => {
    visitUrl();
    cy.contains("Source").click();
    popover().find('[placeholder="Search the list"]');
    popover().contains("Affiliate");
  });

  it("should allow searching ORDER.USER_ID by PEOPLE.NAME", () => {
    visitUrl();
    cy.contains("User").click();
    popover()
      .find('[placeholder="Search by Name or enter an ID"]')
      .type("Aly");
    popover().contains("Alycia Collins - 541");
  });

  it("should accept url parameters", () => {
    visitUrl();
    cy.url().then(url => cy.visit(url + "?id=1&id=3"));
    cy.contains(".ScalarValue", "2");
  });
}

const createQuestion = ({ ORDERS, PEOPLE }) =>
  cy.request("PUT", "/api/card/3", {
    name: "Test Question",
    dataset_query: {
      type: "native",
      native: {
        query:
          "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */",
        "template-tags": {
          id: {
            id: "3fce42dd-fac7-c87d-e738-d8b3fc9d6d56",
            name: "id",
            display_name: "Id",
            type: "dimension",
            dimension: ["field-id", PEOPLE.ID],
            "widget-type": "id",
            default: null,
          },
          name: {
            id: "1fe12d96-8cf7-49e4-05a3-6ed1aea24490",
            name: "name",
            display_name: "Name",
            type: "dimension",
            dimension: ["field-id", PEOPLE.NAME],
            "widget-type": "category",
            default: null,
          },
          source: {
            id: "aed3c67a-820a-966b-d07b-ddf54a7f2e5e",
            name: "source",
            display_name: "Source",
            type: "dimension",
            dimension: ["field-id", PEOPLE.SOURCE],
            "widget-type": "category",
            default: null,
          },
          user_id: {
            id: "cd4bb37d-8404-488e-f66a-6545a261bbe0",
            name: "user_id",
            display_name: "User",
            type: "dimension",
            dimension: ["field-id", ORDERS.USER_ID],
            "widget-type": "id",
            default: null,
          },
        },
      },
      database: 1,
    },
    display: "scalar",
    description: null,
    visualization_settings: {},
    collection_id: null,
    result_metadata: null,
    metadata_checksum: null,
  });

const createDashboard = () =>
  cy.request("POST", "/api/dashboard", {
    name: "Test Dashboard",
    collection_id: null,
    parameters: [
      { name: "Id", slug: "id", id: "1", type: "id" },
      { name: "Name", slug: "name", id: "2", type: "category" },
      { name: "Source", slug: "source", id: "3", type: "category" },
      { name: "User", slug: "user_id", id: "4", type: "id" },
    ],
  });

const addCardToDashboard = ({ dashboardId, questionId }) =>
  cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
    cardId: questionId,
  });

const mapParameters = ({ dashboardId, dashcardId, questionId }) =>
  cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
    cards: [
      {
        id: dashcardId,
        card_id: questionId,
        row: 0,
        col: 0,
        sizeX: 18,
        sizeY: 6,
        series: [],
        visualization_settings: {},
        parameter_mappings: [
          {
            parameter_id: "1",
            card_id: questionId,
            target: ["dimension", ["template-tag", "id"]],
          },
          {
            parameter_id: "2",
            card_id: questionId,
            target: ["dimension", ["template-tag", "name"]],
          },
          {
            parameter_id: "3",
            card_id: questionId,
            target: ["dimension", ["template-tag", "source"]],
          },
          {
            parameter_id: "4",
            card_id: questionId,
            target: ["dimension", ["template-tag", "user_id"]],
          },
        ],
      },
    ],
  });
