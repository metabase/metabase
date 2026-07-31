/**
 * react-router v7's `useNavigate`.
 *
 * - `navigate(to, { replace?, state?, relative? })` pushes (or replaces) the location.
 * - `navigate(delta)` moves through the history stack (e.g. `navigate(-1)`).
 *
 * A relative `to` (`".."`, `"child"`) resolves against the route the calling
 * component renders in. The facade used to resolve it against the deepest
 * matched route instead, so a component rendered by a parent route climbed from
 * the leaf; v7 climbs from the component's own route.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useNavigate
 */
export { useNavigate } from "react-router";
