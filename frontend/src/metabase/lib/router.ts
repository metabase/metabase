import {
  goBack,
  push,
  replace,
  routerActions,
  routerMiddleware,
  routerReducer,
  syncHistoryWithStore,
} from "react-router-redux";

// Centralized re-exports for legacy react-router-redux integration.
// New code should import navigation helpers from here instead of directly
// from "react-router-redux", so we can replace the implementation later.

export {
  goBack,
  push,
  replace,
  routerMiddleware,
  routerReducer,
  routerActions,
};

export { syncHistoryWithStore };
