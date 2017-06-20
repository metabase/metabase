import _ from "underscore";

import Question from "metabase-lib/lib/Question";
import { getMode } from "metabase/qb/lib/modes";

import type {
    ClickAction,
    ClickObject,
    QueryMode
} from "metabase/meta/types/Visualization";

export default class Mode {
    _question: Question
    _queryMode: QueryMode

    constructor(question: Question, queryMode: QueryMode) {
        this._question = question;
        this._queryMode = queryMode
    }

    static forQuestion(question: Question): ?Mode {
        // TODO: Move getMode here and refactor it after writing tests
        const card = question.card();
        const tableMetadata = question.tableMetadata();
        const queryMode = getMode(card, tableMetadata)

        return new Mode(question, queryMode);
    }

    queryMode() {
        return this._queryMode;
    }

    name() {
        return this._queryMode.name;
    }

    actions(): ClickAction[] {
        return _.flatten(
            this._queryMode.actions.map(actionCreator =>
                actionCreator({question: this._question}))
        );
    }

    actionsForClick(clicked: ?ClickObject): ClickAction[] {
        return _.flatten(
            this._queryMode.drills.map(actionCreator =>
                actionCreator({question: this._question, clicked}))
        );
    }
}