import Query from "./query";
import {
    ORDERS_PRODUCT_FK_FIELD_ID,
    question,
} from "metabase/__support__/sample_dataset_fixture";

describe('Legacy Query library', () => {
    it('cleanQuery should pass for a query created with metabase-lib', () => {
        const datasetQuery = question.query()
            .addAggregation(["count"])
            .datasetQuery()

        Query.cleanQuery(datasetQuery)

        expect(datasetQuery).toBeDefined()
    })
})

