/**
 * Redux selectors for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { getMetadata } from "metabase/selectors/metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Question from "metabase-lib/lib/Question";

export const getCurrentQuery = state => {
    // NOTE Atte Keinänen 8/14/17: This is a useless question that will go away after query lib refactoring
    const question = Question.create({ metadata: getMetadata(state) })
    const datasetQuery = state.new_query.datasetQuery;
    return new StructuredQuery(question, datasetQuery)
}

export const getPlainNativeQuery = state => {
    const question = Question.create({ metadata: getMetadata(state) })
    return new NativeQuery(question)
}