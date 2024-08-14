export function createModelIndex({ modelId, pkName, valueName }) {
  // since field ids are non-deterministic, we need to get them from the api
  cy.request("GET", `/api/table/card__${modelId}/query_metadata`).then(
    ({ body }) => {
      const pkRef = [
        "field",
        body.fields.find(f => f.name === pkName).id,
        null,
      ];
      const valueRef = [
        "field",
        body.fields.find(f => f.name === valueName).id,
        null,
      ];

      cy.request("POST", "/api/model-index", {
        pk_ref: pkRef,
        value_ref: valueRef,
        model_id: modelId,
      }).then(response => {
        expect(response.body.state).to.equal("indexed");
        expect(response.body.id).to.equal(1);
      });
    },
  );
}
