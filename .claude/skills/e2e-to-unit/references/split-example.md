# Split example: no upload button for a sandboxed user

Cypress sandboxed a user, opened `/collection/root`, and checked that "Upload data" does not show. The claim has two owners:

- Backend: the server computes `can_upload` on `GET /api/database`.
- Frontend: `CollectionHeader` shows the button from `can_upload`.

The `can_upload` field is the seam. Both sides test it, so no Cypress test is left.

Backend, `enterprise/backend/test/metabase_enterprise/sandbox/upload_test.clj`:

```clojure
(met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
  (upload-test/with-uploads-enabled!
    (testing "Sanity check: an unsandboxed admin can upload"
      (is (true? (:can_upload (mt/user-http-request :crowberto :get 200 (str "database/" (mt/id)))))))
    (testing "GET /api/database/:id"
      (is (false? (:can_upload (mt/user-http-request :rasta :get 200 (str "database/" (mt/id)))))))))
```

The admin check is the positive control. Without it, the first version passed because uploads were off in the sandbox copy.

Frontend, `CollectionHeader/tests/common.unit.spec.tsx`:

```ts
it("should not show the upload button if uploads are enabled but the user cannot upload to the database", () => {
  setup({ collection: { can_write: true }, uploadsEnabled: true, canUpload: false, isAdmin: false });
  expect(screen.queryByLabelText("Upload data")).not.toBeInTheDocument();
});
```

| Mutant | Result |
|---|---|
| `false #_(perms/sandboxed-user?)` in `upload/impl.clj` | backend fails |
| `(canUpload \|\| uploadsEnabled)` in `CollectionHeader.tsx` | Jest fails |
| `?.is_sample` for `?.can_upload` in `CollectionContent.tsx` | only the "button shows" control fails |

Confidence lost: no test runs a real sandboxed user through the collection page.
