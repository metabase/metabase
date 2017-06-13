/**
 * Redux selectors for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { getQuestion } from "metabase/query_builder/selectors";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export const getQuery = state => new StructuredQuery(getQuestion(state), state.new_query.datasetQuery);
