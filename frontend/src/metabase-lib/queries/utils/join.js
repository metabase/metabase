// returns canonical list of Joins, with nulls removed
export function getJoins(joins) {
  return (joins || []).filter(b => b != null);
}
