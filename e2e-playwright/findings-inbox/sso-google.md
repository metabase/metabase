# sso-google (admin-2/sso/google.cy.spec.js → tests/sso-google.spec.ts)

5/5 tests ported, green on the jar (slot 3, PW_ACTION_TIMEOUT=30000), 10/10
under `--repeat-each=2`. tsc clean. New helper file `support/sso-google.ts`
(no shared files edited).

## Result
Faithful port, no product bugs, no fixmes, no cross-check needed (everything
passed first try on the jar).

## Fixes / decisions classified

All mechanical, all covered by existing PORTING rules — nothing new:

- **Three `cy.intercept().as()` → `waitForResponse` predicates** (rule 2),
  registered before the triggering click, matched on method + `URL.pathname`.
  Note the three aliases hit distinguishable paths:
  `PUT /api/setting` (bulk, exact), `PUT /api/setting/<key>` (single, prefix),
  `PUT /api/google/settings`.
- **`H.typeAndBlurUsingLabel`** (clear+type+blur on a labelled field) →
  `getByLabel(label, { exact: true })` + `fill` + `blur`. `fill` fires the
  input event Formik's controlled `FormTextInput` reads, so the form goes
  dirty and the submit button enables — no need for `pressSequentially` here
  (this is a normal admin form input, not an EditableText title).
- **`cy.findByDisplayValue(value)`** on the Client ID field →
  `toHaveValue` on the labelled input (getByDisplayValue is missing from this
  install's Playwright types; same assertion in intent).
- **`cy.findByText`/`findByRole` exact strings** → `{ exact: true }` (rule 1).
  The submit button's transient "Success" state is `getByRole("button",
  { name: "Success", exact: true })`.
- **Ordering of `setupGoogleAuth` vs `signOut`** matters: the PUT
  `/api/google/settings` runs through `mb.api` on the *current* session, so it
  is always issued while signed in as admin, before the `signOut`. The Cypress
  ordering already had this right; preserved verbatim.

## Dividends
None. No Cypress-masked issues, no strengthened assertions of note. Clean
one-pass port.

## Security note
Client-id / domain values (`example*.apps.googleusercontent.com`,
`example.test`) are the exact dummy fixtures from the original spec — test
fixtures, not real credentials. No secrets logged.
