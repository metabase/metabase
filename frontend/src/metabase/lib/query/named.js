/* @flow */

export function stripNamedClause(mbql) {
  if (mbql && mbql[0] === "named") {
    return mbql[1];
  } else {
    return mbql;
  }
}
