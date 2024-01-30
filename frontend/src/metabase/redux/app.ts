import { push, LOCATION_CHANGE, CALL_HISTORY_METHOD } from "react-router-redux";
import type { Middleware, Store, Action } from "redux";
import type { History } from "history";
import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";
import {
  isSmallScreen,
  openInBlankWindow,
  shouldOpenInBlankWindow,
} from "metabase/lib/dom";

import type { Dispatch } from "metabase-types/store";

interface LocationChangeAction {
  type: typeof LOCATION_CHANGE;
  payload: {
    pathname: string;
    search: string;
    hash: string;
    action: string;
    key: string;
    state?: any;
    query?: any;
  };
}

const isLocationChangeAction = (
  action: Action<any>,
): action is LocationChangeAction => {
  return action.type === LOCATION_CHANGE;
};

interface CallHistoryMethodAction {
  type: typeof CALL_HISTORY_METHOD;
  payload: {
    method: "push" | "replace" | "go" | "goBack" | "goForward";
    args: any;
  };
}

const isCallHistoryMethodAction = (
  action: Action<any>,
): action is CallHistoryMethodAction => {
  return action.type === CALL_HISTORY_METHOD;
};

export const SET_ERROR_PAGE = "metabase/app/SET_ERROR_PAGE";
export function setErrorPage(error: any) {
  console.error("Error:", error);
  return {
    type: SET_ERROR_PAGE,
    payload: error,
  };
}

interface IOpenUrlOptions {
  blank?: boolean;
  event?: Event;
  blankOnMetaOrCtrlKey?: boolean;
  blankOnDifferentOrigin?: boolean;
}

export const openUrl =
  (url: string, options: IOpenUrlOptions) => (dispatch: Dispatch) => {
    if (shouldOpenInBlankWindow(url, options)) {
      openInBlankWindow(url);
    } else {
      dispatch(push(url));
    }
  };

const errorPage = handleActions(
  {
    [SET_ERROR_PAGE]: (_, { payload }) => payload,
    [LOCATION_CHANGE]: () => null,
  },
  null,
);

// regexr.com/7r89i
// A word boundary is added to /model so it doesn't match /browse/models
const PATH_WITH_COLLAPSED_NAVBAR = /\/(model\b|question|dashboard|metabot).*/;

export function isNavbarOpenForPathname(pathname: string, prevState: boolean) {
  return (
    !isSmallScreen() && !PATH_WITH_COLLAPSED_NAVBAR.test(pathname) && prevState
  );
}

export const OPEN_NAVBAR = "@@metabase/app/OPEN_NAVBAR";
export const CLOSE_NAVBAR = "@@metabase/app/CLOSE_NAVBAR";
export const TOGGLE_NAVBAR = "@@metabase/app/TOGGLE_NAVBAR";
export const SET_NAVBAR_STATE_FROM_HISTORY_STATE =
  "@@metabase/app/SET_NAVBAR_STATE_FROM_HISTORY_STATE";

export const openNavbar = createAction(OPEN_NAVBAR);
export const closeNavbar = createAction(CLOSE_NAVBAR);
export const toggleNavbar = createAction(TOGGLE_NAVBAR);
export const setNavbarStateFromHistoryState = createAction(
  SET_NAVBAR_STATE_FROM_HISTORY_STATE,
);

const navbarActions = {
  [OPEN_NAVBAR]: () => true,
  [TOGGLE_NAVBAR]: (isOpen: boolean) => !isOpen,
  [CLOSE_NAVBAR]: () => false,
  [SET_NAVBAR_STATE_FROM_HISTORY_STATE]: (_: any, action: any) =>
    action.payload,
  [LOCATION_CHANGE]: (
    prevState: boolean,
    { payload }: LocationChangeAction,
  ) => {
    if (
      (payload.action === "POP" || payload.action === "REPLACE") &&
      payload.state?.isNavbarOpen !== undefined
    ) {
      return payload.state.isNavbarOpen;
    }

    if (payload.state?.preserveNavbarState) {
      return prevState;
    }

    return isNavbarOpenForPathname(payload.pathname, prevState);
  },
};

const isNavbarOpen = handleActions(navbarActions, true);
const isSetNavbarStateFromHistoryStateAction = (action: any) =>
  action.type === SET_NAVBAR_STATE_FROM_HISTORY_STATE;

const isNavAction = (action: any) => action.type in navbarActions;
const isPopLocAction = (action: any) =>
  isLocationChangeAction(action) && action.payload?.action === "POP";
const isPushLocAction = (action: any) =>
  isLocationChangeAction(action) && action.payload?.action === "PUSH";
const isNavbarHistoryStateSet = (loc: any) =>
  loc?.state?.isNavbarOpen !== undefined;

const compareNavbarStates = (
  history: History,
  state: ReturnType<Store["getState"]>,
) => {
  const loc = history.getCurrentLocation();
  const isNavbarOpenInHistory = loc?.state?.isNavbarOpen;
  const isNavbarOpenInRedux = state.app.isNavbarOpen;

  return {
    loc,
    isHistorySet: isNavbarHistoryStateSet(loc),
    isEqual: isNavbarOpenInHistory === isNavbarOpenInRedux,
    isNavbarOpenInHistory,
  };
};

export const navbarRouterHistorySyncMiddleware = (
  history: History,
): Middleware => {
  return store => next => action => {
    if (action.type === CALL_HISTORY_METHOD) {
      const { method, args } = action.payload;
      // @ts-ignore
      history[method](...args);
    } else {
      const result = next(action);


      if (isSetNavbarStateFromHistoryStateAction(action)) {
        // skip manual navbar set action
        return result;
      } else if (action.payload?.action === "POP") {
        const navStates = compareNavbarStates(history, store.getState());
        if (navStates.isHistorySet && !navStates.isEqual) {
          console.log(
            "syncing history to redux",
            navStates.isNavbarOpenInHistory,
          );
          store.dispatch({
            type: SET_NAVBAR_STATE_FROM_HISTORY_STATE,
            payload: navStates.isNavbarOpenInHistory,
          });
        }
      } else if (
        action.type in navbarActions &&
        action.type !== SET_NAVBAR_STATE_FROM_HISTORY_STATE &&
        (action.payload?.action !== "REPLACE" ||
          (action.payload?.action === "REPLACE" &&
            action.payload?.state?.isNavbarOpen === undefined))
      ) {
        const loc = action.type === LOCATION_CHANGE ? action.payload : history.getCurrentLocation();
        const isNavbarOpenInHistory = loc?.state?.isNavbarOpen;
        const isNavbarOpenInRedux = store.getState().app.isNavbarOpen;
        if (isNavbarOpenInRedux !== isNavbarOpenInHistory) {
          const nextLocState = {
            ...(loc.state || {}),
            isNavbarOpen: isNavbarOpenInRedux,
          };
          console.log("syncing redux to history", isNavbarOpenInRedux);
          history.replace({ ...loc, state: nextLocState });
        }
        // const navStates = compareNavbarStates(history, store.getState());
        // console.log({ navStates });
        // if (!navStates.isEqual) {
        //   const { isNavbarOpen } = store.getState().app;
        //   const nextLocState = { ...(navStates.loc.state || {}), isNavbarOpen: navStates };
        //   history.replace({ ...navStates.loc, state: nextLocState });
        // }
      }

      return result;
    }
  };
};

// SECOND
// [x] when location change happens and it's a POP event, then dispatch an action to update redux
// [x] when any of the navbar actions happen, except location change that are POPs, replace the current history state with the new one
// [x] when history method is dispatched, make sure that it has the navbar state in it's state if it tries to set a state value
// [ ] preserveNavbarState...
//
// export const navbarRouterHistorySyncMiddleware = (
//   history: History,
// ): Middleware => {
//   return store => next => action => {
//     (window as any).historyPackage = history;
//     // when location change happens and it's a POP event, then dispatch an action to update redux if we have history state for that route
//     if (isLocationChangeAction(action) && action.payload.action === "POP") {
//       debugger;
//       const isNavbarOpenHistoryState =
//         history.getCurrentLocation()?.state?.isNavbarOpen;
//       if (isNavbarOpenHistoryState !== undefined) {
//         store.dispatch(
//           setNavbarStateFromHistoryState(isNavbarOpenHistoryState),
//         );
//       }
//       return next(action);
//       // ignore
//     } else if (
//       (isLocationChangeAction(action) && action.payload.action === "REPLACE") ||
//       action.type === SET_NAVBAR_STATE_FROM_HISTORY_STATE
//     ) {
//       debugger;
//       return next(action);
//     } else if (action.type in navbarActions) {
//       const result = next(action);
//       debugger;
//       const loc = history.getCurrentLocation();
//       const isNavbarOpen = store.getState().app.isNavbarOpen;
//       const nextState = { ...(loc.state || {}), isNavbarOpen };
//       history.replace({ ...loc, state: nextState });
//       return result;
//       // when history method is dispatched, make sure that it has the navbar state in it's state if it tries to set a state value
//     } else if (isCallHistoryMethodAction(action)) {
//       debugger;
//       const {
//         payload: { method, args },
//       } = action;
//
//       if (method === "replace") {
//         const loc = history.getCurrentLocation();
//         if (loc.state && loc.state?.isNavbarOpen === undefined) {
//           const loc = args[0];
//           const isNavbarOpen = store.getState().app.isNavbarOpen;
//           history.replace({ ...loc, state: { ...loc.state, isNavbarOpen } });
//         } else {
//           // @ts-ignore
//           history[method](...args);
//         }
//       } else {
//         // @ts-ignore
//         history[method](...args);
//       }
//     } else {
//       return next(action);
//     }
//   };
// };

// FIRST
// export const navbarRouterHistorySyncMiddleware = (
//   history: History,
// ): Middleware => {
//   return store => next => action => {
//     console.log(
//       "navbarRouterHistorySyncMiddleware",
//       "before",
//       history.getCurrentLocation()?.state?.isNavbarOpen,
//     );
//     if (isCallHistoryMethodAction(action)) {
//       const {
//         payload: { method, args },
//       } = action;
//       console.log(
//         "navbarRouterHistorySyncMiddleware",
//         "isCallHistoryMethodAction",
//         action,
//       );
//
//       if (method === "replace") {
//         const { isNavbarOpen } = store.getState().app;
//         history.replace({
//           ...args,
//           state: { ...(args.state || {}), isNavbarOpen },
//         });
//       } else {
//         // @ts-ignore
//         history[method](...args);
//       }
//
//       console.log(
//         "navbarRouterHistorySyncMiddleware",
//         "after if",
//         history.getCurrentLocation()?.state?.isNavbarOpen,
//       );
//     } else {
//       const result = next(action);
//
//       if (
//         isLocationChangeAction(action) &&
//         !action.payload.state?.preserveNavbarState
//       ) {
//         console.log(
//           "navbarRouterHistorySyncMiddleware",
//           "isLocationChangeAction and not preserving",
//           action,
//         );
//         // setNavbarStateFromHistoryState(
//       } else if (action.type in navbarActions) {
//         console.log(
//           "navbarRouterHistorySyncMiddleware",
//           "navbarAction",
//           action,
//         );
//         const loc = history.getCurrentLocation();
//         history.replace({
//           ...loc,
//           state: { ...(loc.state || {}), isNavbarOpen },
//         });
//       }
//       // TODO: handle if this is any of the other navbar actions...
//       // i need to update this history value when that happens with the new state vaue
//
//       console.log(
//         "navbarRouterHistorySyncMiddleware",
//         "after else",
//         history.getCurrentLocation()?.state?.isNavbarOpen,
//       );
//
//       return result;
//     }
//   };
// };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  errorPage,
  isNavbarOpen,
});
