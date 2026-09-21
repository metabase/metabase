const { H } = cy;

describe("scenarios > dashboard > filters > SQL > number", () => {
  const questionDetails = {
    name: "Question 1",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] [[ and rating > {{rating}} ]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
        rating: {
          type: "number",
          name: "rating",
          id: "68821a54-f0f3-4f09-8c32-6f7c0e5e5399",
          "display-name": "Rating",
        },
      },
    },
  };

  const filterDetails = [
    {
      name: "Rating",
      slug: "rating",
      id: "10c0d4ba",
      type: "number/=",
      sectionId: "number",
    },
    {
      name: "Price",
      slug: "price",
      id: "88b1a9dd",
      type: "number/=",
      sectionId: "number",
    },
  ];

  const parameterMapping = filterDetails.map((filter) => ({
    parameter_id: filter.id,
    target: ["variable", ["template-tag", filter.slug]],
  }));

  const dashboardDetails = {
    name: "Dashboard #31975",
    parameters: filterDetails,
  };
  const dashcardDetails = {
    row: 0,
    col: 0,
    size_x: 16,
    size_y: 8,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            ...dashcardDetails,
            parameter_mappings: parameterMapping.map((mapping) => ({
              ...mapping,
              card_id,
            })),
          },
        ],
      });

      H.visitDashboard(dashboard_id);
    });
  });

  it("should keep filter value on blur (metabase#31975)", () => {
    cy.findByPlaceholderText("Price").type("95").blur();
    cy.findByPlaceholderText("Rating").type("3.8").blur();

    cy.findByTestId("table-body")
      .findAllByRole("row")
      .should("have.length", 2)
      // first line price
      .and("contain", "98.82")
      // first line rating
      .and("contain", "4.3")
      // second line price
      .and("contain", "95.93")
      // second line rating
      .and("contain", "4.4");
  });
});
