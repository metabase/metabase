describe("Embedding SDK: metabase-nodejs-react-sdk-embedding-sample compatibility", () => {
  it("should open an Interactive Question", () => {
    cy.visit({
      url: "/",
    });

    // eslint-disable-next-line
    expect(cy.findByText("Orders by product category").should("exist"));
  });
});
