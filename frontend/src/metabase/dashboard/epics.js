import { combineEpics } from "redux-observable";
import Rx from "rxjs/Rx";

import { FETCH_CARD_DATA, FETCH_CARD_DATA_RESULT } from "./dashboard";
import { CardApi, PublicApi, EmbedApi } from "metabase/services";

function loadDashcardData(params) {
    let dataObservable;
    if (params.result) {
        // this feels a little hacky, but the action creator might return `result` inline
        dataObservable = Rx.Observable.just(params.result);
    } else if (params.uuid) {
        dataObservable = PublicApi.dashboardCardQuery.$o(params);
    } else if (params.token) {
        dataObservable = EmbedApi.dashboardCardQuery.$o(params);
    } else {
        dataObservable = CardApi.query.$o(params);
    }
    return dataObservable.catch(error => Rx.Observable.just({ error }));
}

const fetchDashboardCardDataEpic = action$ =>
    action$
        // only handle FETCH_CARD_DATA actions
        .filter(action => action.type === FETCH_CARD_DATA)
        // group by the dashcard + card IDs
        .groupBy(({ payload }) => `${payload.dashcardId},${payload.cardId}`)
        // merge all the sub streams
        .mergeMap(sub =>
            // switchMap will cause pending requests to be cancelled when a new one comes in
            sub.switchMap(({ payload }) =>
                // load the data and return the FETCH_CARD_DATA_RESULT action
                loadDashcardData(payload).map(result => ({
                    type: FETCH_CARD_DATA_RESULT,
                    payload: {
                        cardId: payload.cardId,
                        dashcardId: payload.dashcardId,
                        result: result
                    }
                }))
            )
        );

export default combineEpics(fetchDashboardCardDataEpic);
