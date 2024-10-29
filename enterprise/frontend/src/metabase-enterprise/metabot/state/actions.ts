import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { setQuestionDisplayType } from "metabase/query_builder/components/chart-type-selector";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type { MetabotReaction } from "metabase-types/api";

import { metabot } from "./reducer";

export const {
  setVisible,
  addUserMessage,
  removeUserMessage,
  clearUserMessages,
} = metabot.actions;

const makeGetFieldRef = (fields: any[]) => (fieldName: string) => {
  const field = fields?.find(field => field.name === fieldName);
  return ["field", field?.id, { "base-type": field?.base_type }];
};

export const processMetabotReactions = createAsyncThunk(
  "metabase-enterprise/metabot/processMetabotReactions",
  async (reactions: MetabotReaction[], { dispatch, getState }) => {
    for (const reaction of reactions) {
      const state = getState();
      try {
        match(reaction)
          .with({ type: "metabot.reaction/message" }, reaction => {
            dispatch(addUserMessage(reaction.message));
          })
          .with({ type: "metabot.reaction/apply-visualizations" }, reaction => {
            const { display, filters, summarizations } = reaction;
            const question = getQuestion(state);
            const getFieldRef = makeGetFieldRef(
              question?.metadata().fieldsList() || [],
            );

            if (!question) {
              // TODO: can we throw here in a way that we can catch below?
              console.error("TODO: something went wrong", { question });
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
                  !!display &&
                  Lib.queryDisplayInfo(question.query()).isEditable,
              }),
            );

            if (display) {
              dispatch(setUIControls({ isShowingRawTable: false }) as any);
            }
          })
          .with({ type: "metabot.reaction/goto-question" }, reaction => {
            dispatch(push(`/question/${reaction.question_id}`) as any);
          })
          .exhaustive();
      } catch (error: any) {
        console.error(error);
        dispatch(clearUserMessages());

        // API issued a reaction that the FE doesn't know about
        if (error?.message?.includes("no pattern matches value")) {
          console.error(
            "Halting processing of reactions. Recieved an invalid metabot reaction: ",
            reaction,
          );
          dispatch(
            addUserMessage(
              t`Oops! I'm able to finish this task. Please contact support.`,
            ),
          );
        } else {
          // Unexpected error occured
          dispatch(
            addUserMessage(
              t`Oops! Something went wrong, I won't be able to fulfill that request.`,
            ),
          );
        }

        break; // prevent trying to process further reactions
      }
    }
  },
);
