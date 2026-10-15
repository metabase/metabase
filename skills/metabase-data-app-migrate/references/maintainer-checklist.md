# Maintainer checklist: bumping the data-app contract version

For Metabase engineers, not for agents migrating an app. The version is bumped
only for a change an app author must act on. Decide the category first:

| Change                                                                                                             | Bump?                              | Proven by                                                  | What the upgrade guide contains                                                |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `@metabase/embedding-sdk-react/data-app` API: components, hooks, types, the bundle factory, `providerProps`        | yes, after one deprecation release | `npm run typecheck`                                        | the symbol table from the `.d.ts` diff, with replacements                      |
| `data_app.yaml` fields, `queries/` and `actions/` conventions, generated-id keys, `resources_metadata.json` format | yes                                | `npm run build` (`sync-resources`)                         | mechanical steps; `sync-resources` upgrades the state it owns                  |
| What an app may declare or run under the permission model                                                          | yes                                | the instance API, read by the agent with the app's API key | instance steps whose _Done when_ is an API response                            |
| Instance-only changes: the app group's grants, collection layout, provisioning                                     | **no**                             | nothing app-side                                           | none; ship a backend migration and make provisioning converge on the next pull |

Deprecation policy for `/data-app` exports: a rename keeps the old name for one
release as a `@deprecated` alias, wired at the fallback point in
`enterprise/frontend/src/metabase-enterprise/data_apps/sandbox/sandbox.ts`
(the `dataAppExports` spread), so old bundles keep running. The release that
deletes the alias bumps the contract version and ships the upgrade.

## In the bump PR

1. `enterprise/backend/src/metabase_enterprise/data_apps/config.clj`:
   `supported-app-version` to `N+1`. `initial-app-version` stays 1.
2. `skills/metabase-data-app-setup/template/data_app.yaml`: `version: N+1`.
   Update the template's source if the contract change touches it.
3. Every e2e fixture manifest that declares a version
   (`e2e/support/assets/data-apps/*/data_app.yaml`,
   `e2e/support/assets/example_synced_data_apps/data_apps/*/data_app.yaml`,
   `e2e/embedding-sdk-host-apps/*/data_app.yaml`): `version: N+1`.
4. `skills/metabase-data-app-migrate/references/upgrades/v<N>-to-v<N+1>.md` from
   `upgrade-guide-template.md`, every section filled. Build the symbol table from
   `git diff <previous-release-tag> -- resources/embedding-sdk/dist/data-app.d.ts`
   after regenerating the declarations (`bun run embedding-sdk:dts:generate`).
5. Verify the guide by hand: take a fresh copy of the _previous_ release's
   template, apply the guide, confirm every _Done when_ prints `ok`, then
   `npm run typecheck && npm run build` pass at `N+1`. Confirm every _Done when_
   also passes unchanged on the new template.
6. Remove any `@deprecated` alias kept for the previous release at the
   `sandbox.ts` fallback point; that removal is the breaking change.
7. `enterprise/frontend/src/embedding-sdk-package/CHANGELOG.md`: a "Data apps
   contract v<N+1>" entry linking the upgrade guide.
8. Run `./bin/test-agent :only '[metabase-enterprise.data-apps.config-test]'`.
   Two tests fail until steps 1, 2, and 4 agree: the template must declare the
   supported version, and the upgrade guides must cover every version from 1 up to it.
