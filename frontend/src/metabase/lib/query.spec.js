import Query from "./query";
import {
    question,
} from "metabase/__support__/sample_dataset_fixture";
import Utils from "metabase/lib/utils";

describe('Legacy Query library', () => {
    it('cleanQuery should pass for a query created with metabase-lib', () => {
        const datasetQuery = question.query()
            .addAggregation(["count"])
            .datasetQuery()

        // We have to take a copy because the original object isn't extensible
        const copiedDatasetQuery = Utils.copy(datasetQuery);
        Query.cleanQuery(copiedDatasetQuery)

        expect(copiedDatasetQuery).toBeDefined()
    })
})

