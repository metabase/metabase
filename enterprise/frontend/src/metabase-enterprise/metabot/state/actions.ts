import { push } from "react-router-redux";
import { match } from "ts-pattern";
import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { setQuestionDisplayType } from "metabase/query_builder/components/chart-type-selector";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type { MetabotReaction } from "metabase-types/api";

import { metabot } from "./reducer";

export const { setVisible } = metabot.actions;

const makeGetFieldRef = (fields: any[]) => (fieldName: string) => {
  const field = fields?.find(field => field.name === fieldName);
  return ["field", field?.id, { "base-type": field?.base_type }];
};

export const processMetabotMessages = createAsyncThunk(
  "metabase-enterprise/metabot/processResponseMessages",
  async (reactions: MetabotReaction[], { dispatch, getState }) => {
    for (const reaction of reactions) {
      const state = getState();

      match(reaction)
        // NOTE: do nothing for messages, they're handled automatically
        .with({ type: "metabot.reaction/message" }, _.noop)
        .with({ type: "metabot.reaction/apply-visualizations" }, reaction => {
          const { display, filters, summarizations } = reaction;
          const question = getQuestion(state);
          const getFieldRef = makeGetFieldRef(
            question?.metadata().fieldsList() || [],
          );

          if (!question) {
            console.error("TODO: something went wrong", { question });
            // TODO: handle error case - user isn't on the qb page i guess?
            return;
          }

          let newQuestion = question;

          if (display) {
            newQuestion = setQuestionDisplayType(question, display);
          }

          if (filters && filters.length) {
            // TODO: only works with a single filter right now
            const queryFilters = _.first(
              filters.map((filter: any) => [
                filter.operator,
                getFieldRef(filter.field),
                filter.value,
              ]),
            );
            const query = newQuestion.query();
            const newQuery = Lib.filter(query, 0, queryFilters as any);
            const newLegacyQuery = Lib.toLegacyQuery(newQuery);
            newQuestion = question.setDatasetQuery(newLegacyQuery);
          }

          if (summarizations && summarizations.length) {
            const query = newQuestion.datasetQuery();
            const summarization = _.first(summarizations);
            const fieldRef = getFieldRef(summarization.field_name);
            const aggregation = [summarization.metrics, fieldRef];
            newQuestion = question.setDatasetQuery({
              ...query,
              // @ts-expect-error - temp: use lib to make modifications
              query: { ...query.query, aggregation: [aggregation] },
            });
          }

          dispatch(
            updateQuestion(newQuestion, {
              run: true,
              shouldUpdateUrl:
                !!display && Lib.queryDisplayInfo(question.query()).isEditable,
            }),
          );

          if (display) {
            dispatch(setUIControls({ isShowingRawTable: false }) as any);
          }
        })
        .with({ type: "metabot.reaction/goto-question" }, reaction => {
          dispatch(push(`/question/${reaction.question_id}`) as any);
        })
        .exhaustive(); // TODO: handle error thrown...
    }
  },
);
