// set the display automatically then run
export function updateAndRunQuery(query) {
  query.question().setDefaultDisplay().update(null, { run: true });
}
