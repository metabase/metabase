/**
 * How many premium features a route gate may test, and the strength the preload
 * sweep covers. One number, so the rule and the sweep cannot drift apart: when
 * the rule fails, the sweep needs raising to match, or the gate needs splitting.
 */
module.exports = { ROUTE_GATE_STRENGTH: 2 };
