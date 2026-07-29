/**
 * The navigation event both engines dispatch on every location change. It no
 * longer feeds a location slice (the `routing` reducer was retired); the
 * `isNavbarOpen` and `errorPage` reducers in `metabase/redux/app` still react to
 * it, and trace-id rotation keys off it.
 */
export const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";
