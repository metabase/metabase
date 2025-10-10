export function adjustPositions(error, origSql) {
  /* Positions in error messages are borked coming in for Postgres errors.
   * Previously, you would see "blahblahblah bombed out, Position: 119" in a 10-character invalid query.
   * This is because MB shoves in 'remarks' into the original query and we get the exception from the query with remarks.
   * This function adjusts the value of the positions in the exception message to account for this.
   * This is done in mildly scary kludge here in frontend after everything,
   * because the alternative of doing it in backend
   * is an absolutely terrifying kludge involving messing with exceptions.
   */
  let adjustmentLength = 0;

  // redshift remarks use c-style multiline comments...
  const multiLineBeginPos = origSql.search("/\\*");
  const multiLineEndPos = origSql.search("\\*/");
  // if multiLineBeginPos is 0 then we know it's a redshift remark
  if (multiLineBeginPos === 0 && multiLineEndPos !== -1) {
    adjustmentLength += multiLineEndPos + 2; // 2 for */ in itself
  }

  const chompedSql = origSql.substr(adjustmentLength);
  // there also seem to be cases where remarks don't get in...
  const commentPos = chompedSql.search("--");
  const newLinePos = chompedSql.search("\n");
  // 5 is a heuristic: this indicates that this is almost certainly an initial remark comment
  if (commentPos !== -1 && commentPos < 5) {
    // There will be a \n after the redshift comment,
    // which is why there needs to be a 2 added
    adjustmentLength += newLinePos + 2;
  }

  return error.replace(/Position: (\d+)/, function (_, p1) {
    return "Position: " + (parseInt(p1) - adjustmentLength);
  });
}

export function stripRemarks(error) {
  /* SQL snippets in error messages are borked coming in for errors in many DBs.
   * You're expecting something with just your sql in the message,
   * but the whole error contains these remarks that MB added in. Confusing!
   */
  return error.replace(
    /-- Metabase:: userID: \d+ queryType: native queryHash: \w+\n/,
    "",
  );
}
