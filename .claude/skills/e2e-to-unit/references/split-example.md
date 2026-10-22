# Split example

## Split: no upload button for a sandboxed user

Commit `1139be54dd2` (#82973) replaced the `describe("permissions")` block in `e2e/test/scenarios/collections/uploads.cy.spec.js`.

### Before: Cypress

Two tests restored the `postgres-12` snapshot, activated a token, enabled uploads, changed the permissions graph, and sandboxed a table. Then they signed in as a sandboxed user or as a user with full access, opened `/collection/root`, and checked whether the "Upload data" button shows.

### Why it splits

The claim has two owners:

- Backend: the server computes `can_upload` on `GET /api/database/:id` and `GET /api/database` from permissions and sandboxing.
- Frontend: `CollectionHeader` shows the button when `collection.can_write && (canUpload || !uploadsEnabled)`.

The seam between them is the `can_upload` field in the API response. Both sides test that field, so no Cypress test is left.

### After: backend

`enterprise/backend/test/metabase_enterprise/sandbox/upload_test.clj`:

```clojure
(deftest can-upload-false-for-sandboxed-user-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/dataset dataset
      (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
        (upload-test/with-uploads-enabled!
          (testing "Sanity check: an unsandboxed admin can upload to the same database"
            (is (true? (:can_upload (mt/user-http-request :crowberto :get 200 (str "database/" (mt/id)))))))
          (testing "GET /api/database/:id"
            (is (false? (:can_upload (mt/user-http-request :rasta :get 200 (str "database/" (mt/id)))))))
          (testing "GET /api/database"
            (is (false? (->> (mt/user-http-request :rasta :get 200 "database")
                             :data
                             (filter #(= (mt/id) (:id %)))
                             first
                             :can_upload)))))))))
```

The first version of this test passed for the wrong reason. `with-gtaps-for-user!` queries a temporary copy of the database, and uploads were enabled on the original only. So `can_upload` was false because uploads were off, not because of the sandbox. The fix was to enable uploads inside the gtaps block and to add the admin check on the same database. A negative assertion needs a positive control in the same setup.

### After: frontend

`CollectionHeader/tests/common.unit.spec.tsx`:

```ts
it("should not show the upload button if uploads are enabled but the user cannot upload to the database", () => {
  setup({
    collection: { can_write: true },
    uploadsEnabled: true,
    canUpload: false,
    isAdmin: false,
  });

  expect(screen.queryByLabelText("Upload data")).not.toBeInTheDocument();
});
```

`CollectionContentUpload.unit.spec.tsx` adds a pair of tests that drive the button from the `can_upload` value in the mocked `GET /api/database` response. One expects the button, and one expects no button. The pair is the positive control for the frontend.

### Proof

Backend: run `metabase-enterprise.sandbox.upload-test/can-upload-false-for-sandboxed-user-test` with the `clojure-eval` skill. Choose the runner as in step 2 of "Split a test" in SKILL.md. The fallback is `./bin/test-agent :only '[metabase-enterprise.sandbox.upload-test/can-upload-false-for-sandboxed-user-test]'` (about 60 s). These results came from `./bin/test-agent`. Both mutants are on the sandbox check in `can-use-uploads-error`, `src/metabase/upload/impl.clj`:

| Mutant | Result |
|---|---|
| `false #_(perms/sandboxed-user?)` (check removed) | fails: `can_upload` is true for the sandboxed user, on both endpoints |
| `(not (perms/sandboxed-user?))` (wrong value) | fails: the admin control gets false, and the sandboxed user gets true |

Frontend, run with `bun run test-unit-keep-cljs --runInBand --runTestsByPath <spec> -t "<title>"`:

| Mutant | Test | Result |
|---|---|---|
| `(true \|\| !uploadsEnabled)` in `CollectionHeader.tsx` (check removed) | the `CollectionHeader` test above | fails |
| `(canUpload \|\| uploadsEnabled)` in `CollectionHeader.tsx` (wrong operand) | the `CollectionHeader` test above | fails |
| `?.is_sample` instead of `?.can_upload` in `CollectionContent.tsx` (wrong key) | the `CollectionContentUpload` pair | the "button shows" test fails, and the "no button" test passes |

The last row shows why the positive control matters. Without the "button shows" test, the wrong-key mutant survives.

### Confidence lost

No test runs a real sandboxed user through the collection page. The `can_upload` field is the seam, and both sides test it.
