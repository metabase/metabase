const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > drillthroughs > geographic drill", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display proper drills for city, state, and lat/lon queries", () => {
    H.createQuestion(
      {
        name: "Geographic Drills",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.STATE, null],
            ["field", PEOPLE.CITY, null],
            ["field", PEOPLE.LATITUDE, { binning: { strategy: "default" } }],
            ["field", PEOPLE.LONGITUDE, { binning: { strategy: "default" } }],
          ],
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("table-body").findAllByText("1").first().click();
    H.popover().within(() => {
      cy.findByText("Zoom in: City").should("be.visible");
      cy.findByText("Zoom in: State").should("be.visible");
      cy.findByText("Zoom in: Lat/Lon").should("be.visible");
      cy.findByText("Zoom in").should("not.exist");
    });
  });

  it("should display normal binning zoom in when only lat exists", () => {
    H.createQuestion(
      {
        name: "Geographic Drills",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.STATE, null],
            ["field", PEOPLE.CITY, null],
            ["field", PEOPLE.LATITUDE, { binning: { strategy: "default" } }],
          ],
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("table-body").findAllByText("1").first().click();
    H.popover().within(() => {
      cy.findByText("Zoom in: City").should("be.visible");
      cy.findByText("Zoom in: State").should("be.visible");
      cy.findByText("Zoom in: Lat/Lon").should("not.exist");
      cy.findByText("Zoom in").should("be.visible");
    });
  });

  it("should display normal binning zoom in when only lon exists", () => {
    H.createQuestion(
      {
        name: "Geographic Drills",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.STATE, null],
            ["field", PEOPLE.CITY, null],
            ["field", PEOPLE.LONGITUDE, { binning: { strategy: "default" } }],
          ],
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("table-body").findAllByText("1").first().click();
    H.popover().within(() => {
      cy.findByText("Zoom in: City").should("be.visible");
      cy.findByText("Zoom in: State").should("be.visible");
      cy.findByText("Zoom in: Lat/Lon").should("not.exist");
      cy.findByText("Zoom in").should("be.visible");
    });
  });

  it("should display both normal and lat/lon zoom in when lat/lon and a binnable column both exist", () => {
    H.createQuestion(
      {
        name: "Geographic Drills",
        query: {
          "source-table": PEOPLE_ID,
          joins: [
            {
              "source-table": ORDERS_ID,
              condition: [
                "=",
                ["field", PEOPLE.ID, null],
                ["field", ORDERS.USER_ID, null],
              ],
              alias: "Orders",
              fields: "all",
            },
          ],
          filter: [
            "not-null",
            ["field", ORDERS.SUBTOTAL, { "join-alias": "Orders" }],
          ],
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.STATE, null],
            ["field", PEOPLE.CITY, null],
            ["field", PEOPLE.LATITUDE, { binning: { strategy: "default" } }],
            ["field", PEOPLE.LONGITUDE, { binning: { strategy: "default" } }],
            [
              "field",
              ORDERS.SUBTOTAL,
              { binning: { strategy: "default" }, "join-alias": "Orders" },
            ],
          ],
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("table-body").findAllByText("1").first().click();
    H.popover().within(() => {
      cy.findByText("Zoom in: City").should("be.visible");
      cy.findByText("Zoom in: State").should("be.visible");
      cy.findByText("Zoom in: Lat/Lon").should("be.visible");
      cy.findByText("Zoom in").should("be.visible");
    });
  });
});
