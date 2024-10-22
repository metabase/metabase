import { push } from "react-router-redux";

import { createAsyncThunk } from "metabase/lib/redux";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { setQuestionDisplayType } from "metabase/query_builder/components/chart-type-selector";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type { MetabotReaction } from "metabase-types/api";

import { metabot } from "./reducer";

export const { setVisible } = metabot.actions;

(window as any).ordersOverTimeQuestionId = 110;
(window as any).demoStep = -1;

export const processMetabotMessages = createAsyncThunk(
  "metabase-enterprise/metabot/processResponseMessages",
  async (reactions: MetabotReaction[], { dispatch, getState }) => {
    for (const reaction of reactions) {
      const state = getState();

      // NOTE: add handlers for new reactions here - dispatch other actions as needed
      if (reaction.type === "metabot.reaction/message") {
        // NOTE: do nothing for messages, they're handled automatically

        // HACK: all code below should be their own reactions...
        // reacting on message allows
        const { demoStep } = window as any;
        if (demoStep === -1) {
          continue;
        }

        // NOTE: SHOULD BE INPUTS FROM METABOT
        if (demoStep === 0) {
          const questionUrl = `/question/${(window as any).ordersOverTimeQuestionId}`;
          dispatch(push(questionUrl) as any);
          continue;
        }

        const question = getQuestion(state);

        if (!question) {
          console.error("TODO: something went wrong", { question });
          // TODO: handle error case - user isn't on the qb page i guess?
          return;
        }

        const display = demoStep === 1 ? "bar" : undefined;
        const filters =
          demoStep === 2
            ? [">", ["field", 42, { "base-type": "type/Float" }], 100]
            : undefined;
        const aggregation =
          demoStep === 3
            ? ["sum", ["field", 42, { "base-type": "type/Float" }]]
            : undefined;

        let newQuestion = question;

        if (display) {
          newQuestion = setQuestionDisplayType(question, display);
        }

        if (filters) {
          const query = newQuestion.query();
          const newQuery = Lib.filter(query, 0, filters as any);
          const newLegacyQuery = Lib.toLegacyQuery(newQuery);
          newQuestion = question.setDatasetQuery(newLegacyQuery);
        }

        if (aggregation) {
          // TODO: can't figure out how to use Lib to do this same change with serialized data
          const query = newQuestion.datasetQuery();
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
      } else {
        console.error(
          "Encounted unexpected message type from Metabot",
          reaction,
        );
      }
    }

    // incremental (window as any).demoStepping to fake demo
    if ((window as any).demoStep > -1) {
      (window as any).demoStep++;
    }
  },
);
