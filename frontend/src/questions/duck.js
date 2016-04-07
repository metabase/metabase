
import { AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";

const CardApi = new AngularResourceProxy("Card", ["list"]);

const SELECT_QUESTION_SECTION = 'metabase/questions/SELECT_QUESTION_SECTION';
const SET_SEARCH_TEXT = 'metabase/questions/SET_SEARCH_TEXT';
const SET_ITEM_CHECKED = 'metabase/questions/SET_ITEM_CHECKED';

export const selectQuestionSection = createThunkAction(SELECT_QUESTION_SECTION, (section = "all", slug) => {
    console.log("section1", section)
    return async (dispatch, getState) => {
        console.log("section2", section)
        let result;
        switch (section) {
            case "all":
                result = await CardApi.list({ filterMode: "all" });
                break;
            default:
                console.log("unknown section " + section);
        }
        return { section, slug, result };
    }
});

export const setSearchText = createAction(SET_SEARCH_TEXT);
export const setItemChecked = createAction(SET_ITEM_CHECKED);

const initialState = {
    questions: [],
    searchText: "",
    checkedItems: {}
};

export default function(state = initialState, { type, payload, error }) {
    switch (type) {
        case SET_SEARCH_TEXT:
            return { ...state, searchText: payload };
        case SET_ITEM_CHECKED:
            return { ...state, checkedItems: { ...state.checkedItems, ...payload } };
        case SELECT_QUESTION_SECTION:
            return { ...state, questions: payload.result };
        default:
            return state;
    }
}
