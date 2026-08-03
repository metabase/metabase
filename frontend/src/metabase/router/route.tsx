/**
 * react-router v7's `<Route>`. It is route configuration and never renders:
 * `createRoutesFromElements` reads its props to build the route tree.
 *
 * The app has authored routes in v7 syntax since the start of the migration, so
 * they now go in as they are, with no translation step. A route can therefore
 * carry any prop v7 reads, `lazy` and `loader` included.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Route
 */
export { Route } from "react-router";
