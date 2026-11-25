const { H } = cy;
import { SAMPLE_DB_ID, USERS, WEBMAIL_CONFIG } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  QuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

const testCases = ["csv", "xlsx"] as const;

const formatUrl =
  "/api/user-key-value/namespace/last_download_format/key/download_format_preference";

const canSavePngQuestion: StructuredQuestionDetails = {
  name: "Q1",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.metrics": ["count"],
    "graph.dimensions": ["CREATED_AT"],
  },
};

const cannotSavePngQuestion: StructuredQuestionDetails = {
  name: "Q2",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
  },
  visualization_settings: {},
};

describe("scenarios > question > download", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("[snowplow]", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("downloads csv and xlsx files", () => {
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders, Count").click();
      });

      H.visualize();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("18,760");

      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, isDashboard: false });

        H.expectUnstructuredSnowplowEvent({
          event: "download_results_clicked",
          resource_type: "ad-hoc-question",
          accessed_via: "internal",
          export_type: fileType,
        });
      });
    });
  });

  it("respects renamed columns in self-joins", () => {
    const idLeftRef = [
      "field",
      ORDERS.ID,
      {
        "base-type": "type/BigInteger",
      },
    ];
    const idRightRef = [
      "field",
      ORDERS.ID,
      {
        "base-type": "type/BigInteger",
        "join-alias": "Orders",
      },
    ];
    const totalLeftRef = [
      "field",
      ORDERS.TOTAL,
      {
        "base-type": "type/Float",
      },
    ];
    const totalRightRef = [
      "field",
      ORDERS.TOTAL,
      {
        "base-type": "type/Float",
        "join-alias": "Orders",
      },
    ];

    const totalLeftColumnKey = '["name","TOTAL"]';
    const totalRightColumnKey = '["name","TOTAL_2"]';

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          fields: [totalLeftRef],
          joins: [
            {
              fields: [totalRightRef],
              strategy: "left-join",
              alias: "Orders",
              condition: ["=", idLeftRef, idRightRef],
              "source-table": ORDERS_ID,
            },
          ],
          "order-by": [["desc", totalLeftRef]],
          limit: 1,
        },
        visualization_settings: {
          column_settings: {
            [totalLeftColumnKey]: {
              column_title: "Left Total",
            },
            [totalRightColumnKey]: {
              column_title: "Right Total",
            },
          },
        },
      },
      { visitQuestion: true, wrapId: true },
    );

    H.queryBuilderMain().findByText("Left Total").should("exist");
    H.queryBuilderMain().findByText("Right Total").should("exist");

    cy.get<number>("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        H.downloadAndAssert({
          questionId,
          fileType,
          enableFormatting: true,
          isDashboard: false,
        });
      });
    });
  });

  describe("from dashboards", () => {
    it("should allow downloading card data and remember the downloaded format", () => {
      cy.intercept("PUT", formatUrl).as("saveFormat");
      cy.intercept("GET", formatUrl).as("fetchFormat");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      // In CI agents after downloads Cypress gets stuck for a while so the downloads status gets closed by timeout
      assertOrdersExport();
      cy.wait("@saveFormat");

      cy.reload();
      cy.wait("@fetchFormat");

      H.getDashboardCard(0).realHover();
      H.getDashboardCardMenu(0).click();
      H.popover().findByText("Download results").click();
      H.popover().within(() => {
        cy.findByRole("radio", { name: ".xlsx" }).should("be.checked");
      });
      cy.realPress("Escape");
      H.popover({ skipVisibilityCheck: true }).should("not.exist");

      H.editDashboard();

      H.setFilter("ID");

      cy.findByTestId("dashcard-container").contains("Select…").click();
      H.popover().contains("ID").eq(0).click();

      H.saveDashboard();

      H.filterWidget().contains("ID").click();

      H.popover().within(() => H.fieldValuesCombobox().type("1"));

      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filter").click();

      cy.wait("@dashcardQuery");

      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      // In CI agents after downloads Cypress gets stuck for a while so the downloads status gets closed by timeout
      assertOrdersExport({ assertParameters: [{ type: "number/=" }] });
    });

    it("should allow downloading parameterized cards opened from dashboards as a user with no self-service permission (metabase#20868)", () => {
      H.createQuestion({
        name: "20868",
        query: {
          "source-table": ORDERS_ID,
        },
        display: "table",
      }).then(({ body: { id: questionId } }) => {
        H.createDashboard().then(({ body: { id: dashboardId } }) => {
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            parameters: [
              {
                id: "92eb69ea",
                name: "ID",
                sectionId: "id",
                slug: "id",
                type: "id",
              },
            ],
          });

          H.addOrUpdateDashboardCard({
            card_id: questionId,
            dashboard_id: dashboardId,
            card: {
              parameter_mappings: [
                {
                  parameter_id: "92eb69ea",
                  card_id: questionId,
                  target: ["dimension", ["field", ORDERS.ID, null]],
                },
              ],
              visualization_settings: {
                click_behavior: {
                  parameterMapping: {
                    "92eb69ea": {
                      id: "92eb69ea",
                      source: { id: "ID", name: "ID", type: "column" },
                      target: {
                        id: "92eb69ea",
                        type: "parameter",
                      },
                    },
                  },
                },
              },
            },
          }).then(({ body: { id } }) => {
            cy.signIn("nodata");
            H.visitDashboard(dashboardId);

            cy.findByLabelText("ID").click();
            H.popover().findByPlaceholderText("Enter an ID").type("1");
            cy.button("Add filter").click();

            cy.findByTestId("legend-caption").contains("20868").click();

            H.downloadAndAssert({
              fileType: "xlsx",
              questionId,
              dashboardId,
              dashcardId: id,
              isDashboard: false,
            });
          });
        });
      });
    });
  });

  describe("png images", () => {
    beforeEach(() => {
      cy.deleteDownloadsFolder();
    });

    it("from query builder", () => {
      H.createQuestion(canSavePngQuestion, { visitQuestion: true });

      cy.findByRole("button", { name: "Download results" }).click();

      H.popover().within(() => {
        cy.findByText(".png").click();
        cy.findByTestId("download-results-button").click();
      });

      cy.verifyDownload(".png", { contains: true });
    });
  });
});

describe("[snowplow] scenarios > dashboard", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.deleteDownloadsFolder();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should download a PDF of a dashboard and png images from dashcards", () => {
    const date = Date.now();
    H.createDashboardWithQuestions({
      dashboardName: `saving pdf dashboard - ${date}`,
      questions: [canSavePngQuestion, cannotSavePngQuestion],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.openSharingMenu("Export as PDF");

      cy.findByTestId("status-root-container")
        .should("contain", "Downloading")
        .and("contain", `Dashboard for saving pdf dashboard - ${date}`);

      H.expectUnstructuredSnowplowEvent({
        event: "dashboard_pdf_exported",
        dashboard_id: dashboard.id,
        dashboard_accessed_via: "internal",
      });
    });

    cy.log("We're adding a 'Metabase-' prefix for non-whitelabelled instances");
    cy.verifyDownload(`Metabase - saving pdf dashboard - ${date}.pdf`);
    H.ensureDownloadStatusDismissed();

    H.showDashboardCardActions(0);
    H.getDashboardCard(0).findByText("Created At: Month").should("be.visible");
    H.getDashboardCardMenu(0).click();

    H.exportFromDashcard(".png");

    H.expectUnstructuredSnowplowEvent({
      event: "download_results_clicked",
      resource_type: "dashcard",
      accessed_via: "internal",
      export_type: "png",
    });

    H.showDashboardCardActions(1);
    H.getDashboardCard(1).findByText("User ID").should("be.visible");
    H.getDashboardCardMenu(1).click();

    H.popover().within(() => {
      cy.findByText("Download results").click();
      cy.findByText(".csv").should("be.visible");
      cy.findByText(".png").should("not.exist");
    });

    cy.verifyDownload(".png", { contains: true });
  });
});

describe("issue 10803", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
      {
        name: "10803",
        native: {
          query:
            "SELECT cast(parsedatetime('2026-06-03', 'yyyy-MM-dd') AS timestamp) AS \"birth_date\", cast(parsedatetime('2026-06-03 23:41:23', 'yyyy-MM-dd HH:mm:ss') AS timestamp) AS \"created_at\"",
        },
      },
      { visitQuestion: true, wrapId: true },
    );
  });

  it("should format the date properly in saved and unsaved questions (metabase#10803)", () => {
    cy.get<number>("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId, isDashboard: false });
      });
    });

    // Add a space at the end of the query to make it "dirty"
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/open editor/i).click();
    H.NativeEditor.focus().type("{movetoend} ");

    H.runNativeQuery();
    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType, isDashboard: false });
    });
  });
});

describe("issue 18382", () => {
  /**
   * This question might seem a bit overwhelming at the first sight.
   * The whole point of this repro was to try to cover as much of the old syntax as possible.
   * We want to make sure it still works when loaded into a new(er) Metabase version.
   */

  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": REVIEWS_ID,
        joins: [
          {
            fields: [
              ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", REVIEWS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        filter: ["and", ["=", ["field-id", REVIEWS.RATING], 4]],
        "order-by": [
          ["asc", ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]]],
        ],
        fields: [
          ["field-id", REVIEWS.ID],
          ["field-id", REVIEWS.REVIEWER],
        ],
        limit: 5,
      },
    },
    display: "table" as const,
    visualization_settings: {
      column_settings: {
        [`["ref",["field",${REVIEWS.ID},null]]`]: {
          column_title: "MOD:ID",
        },
        [`["ref",["field",${REVIEWS.REVIEWER},null]]`]: {
          column_title: "MOD:Reviewer",
        },
        [`["ref",["field",${PRODUCTS.TITLE},null]]`]: {
          column_title: "MOD:Title",
        },
      },
      // Reorder columns
      "table.columns": [
        {
          name: "TITLE",
          fieldRef: ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]],
          enabled: true,
        },
        {
          name: "ID",
          fieldRef: ["field-id", REVIEWS.ID],
          enabled: true,
        },
        {
          name: "REVIEWER",
          fieldRef: ["field-id", REVIEWS.REVIEWER],
          enabled: true,
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc(questionDetails);
  });

  it("should handle the old syntax in downloads (metabase#18382)", () => {
    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType, isDashboard: false });
    });
  });
});

describe("issues 18440 and 18573", () => {
  const query = { "source-table": ORDERS_ID, limit: 5 };

  const questionDetails = {
    dataset_query: {
      type: "query",
      query,
      database: SAMPLE_DB_ID,
    },
  };

  const renamedColumnQuestionDetails = {
    dataset_query: {
      type: "query",
      query: { "source-table": ORDERS_ID, limit: 2 },
      database: SAMPLE_DB_ID,
    },
    visualization_settings: {
      column_settings: {
        [`["ref",["field",${ORDERS.PRODUCT_ID},null]]`]: {
          column_title: "Foo",
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
  });

  it("export should include remapped values and preserve renamed remapped columns (metabase#18440, metabase#18573)", () => {
    cy.log("ad-hoc question (metabase#18440-1)");
    H.visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType, isDashboard: false });
    });

    cy.log("saved question (metabase#18440-2)");
    H.createQuestion({ query }).then(({ body: { id } }) => {
      H.visitQuestion(id);

      cy.findByText("Product ID");
      cy.findByText("Awesome Concrete Shoes");

      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId: id, isDashboard: false });
      });
    });

    cy.log("renamed remapped column (metabase#18573)");
    H.visitQuestionAdhoc(renamedColumnQuestionDetails);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    H.downloadAndAssert({ fileType: "xlsx", isDashboard: false });
  });
});

describe("issue 18729", () => {
  const questionDetails: QuestionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month-of-year" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        limit: 2,
      },
      type: "query",
    },
    display: "line",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should properly format the 'X of Y' dates in exports (metabase#18729)", () => {
    H.visitQuestionAdhoc(questionDetails);

    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType, isDashboard: false });
    });
  });
});

describe("issue 19889", () => {
  const questionDetails = {
    name: "19889",
    native: {
      query: 'select 1 "column a", 2 "column b", 3 "column c"',
    },
  };

  function saveAndOverwrite() {
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByText("Save").click();
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails, {
      loadMetadata: true,
      wrapId: true,
    });

    // Reorder columns a and b
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a").trigger("mousedown", 0, 0).wait(100); //Don't force the first interaction. This ensures things are actually visible to start moving
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mousemove", 10, 10, { force: true })
      .wait(100);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mousemove", 100, 0, { force: true })
      .wait(100);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mouseup", 100, 0, { force: true })
      .wait(100);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").click(); // Give DOM some time to update
  });

  it("should order columns correctly in unsaved and saved native query exports", () => {
    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType, isDashboard: false });
    });

    saveAndOverwrite();

    cy.get<number>("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId, isDashboard: false });
      });
    });
  });

  it("should order columns correctly in saved native query exports when the query was modified but not re-run before save (#19889)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/open editor/i).click();
    H.NativeEditor.focus().type(
      '{selectall}select 1 "column x", 2 "column y", 3 "column c"',
    );

    saveAndOverwrite();

    cy.get<number>("@questionId").then((questionId) => {
      H.visitQuestion(questionId);

      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId, isDashboard: false });
      });
    });
  });
});

describe("issue 70909", () => {
  const { WEB_PORT } = WEBMAIL_CONFIG;
  const { admin } = USERS;

  type Email = {
    id: number;
    attachments: { contentType: string; generatedFileName: string }[];
  };

  function assertCsvHeaderMatchesTable(csv: string) {
    const header = csv.replace(/^\uFEFF/, "").split(/\r?\n/)[0];
    expect(header).to.include("Tax");
    expect(header).not.to.include("Discount");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${ORDERS.DISCOUNT}`, {
      visibility_type: "details-only",
    });
  });

  it("should not export columns hidden by 'Only in detail views' field visibility (metabase#70909)", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.tableInteractive().findByText("Tax").should("be.visible");
    H.tableInteractive().findByText("Discount").should("not.exist");

    H.downloadAndAssert({
      fileType: "csv",
      questionId: ORDERS_QUESTION_ID,
      isDashboard: false,
      assertResponseBody: assertCsvHeaderMatchesTable,
    });
  });

  it("should not export columns hidden by 'Only in detail views' field visibility from an unsaved question (metabase#70909)", () => {
    H.openOrdersTable();
    H.tableInteractive().findByText("Tax").should("be.visible");
    H.tableInteractive().findByText("Discount").should("not.exist");

    H.downloadAndAssert({
      fileType: "csv",
      isDashboard: false,
      assertResponseBody: assertCsvHeaderMatchesTable,
    });
  });

  it("should not attach columns hidden by 'Only in detail views' field visibility to subscriptions (metabase#70909)", () => {
    H.setupSMTP();
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.toggleDashboardSubscriptionsSidebar();
    H.sidebar().within(() => {
      cy.findByText("Email it").click();
      cy.findByPlaceholderText("Enter user names or email addresses").click();
    });
    H.popover().findByText(`${admin.first_name} ${admin.last_name}`).click();
    H.sidebar().within(() => {
      // Closes the recipients popover that covers the attachment controls
      cy.findByText("To").click();
      cy.findByLabelText("Attach results").click({ force: true });
      cy.findByText("Questions to attach").click();
    });

    H.sendEmailAndAssert((email: Email) => {
      const csvAttachment = email.attachments.find(
        (attachment) => attachment.contentType === "text/csv",
      );
      expect(csvAttachment).to.exist;

      cy.request<string>({
        method: "GET",
        url: `http://localhost:${WEB_PORT}/email/${email.id}/attachment/${csvAttachment?.generatedFileName}`,
        encoding: "utf8",
      }).then(({ body }) => assertCsvHeaderMatchesTable(body));
    });
  });
});

function assertOrdersExport({
  assertParameters,
}: { assertParameters?: { type: string }[] } = {}) {
  H.downloadAndAssert({
    fileType: "xlsx",
    questionId: ORDERS_QUESTION_ID,
    dashcardId: ORDERS_DASHBOARD_DASHCARD_ID,
    dashboardId: ORDERS_DASHBOARD_ID,
    isDashboard: true,
    assertParameters,
  });
}
