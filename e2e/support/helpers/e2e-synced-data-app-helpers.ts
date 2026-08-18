import { LOCAL_GIT_PATH } from "./e2e-remote-sync-helpers";

/**
 * TODO: delete this file and use `sync-data-app-fixture.mjs`
 * instead for a more realistic test that uses CLI sync logic.
 */

export const SYNCED_DATA_APPS_FIXTURE_PATH =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_synced_data_apps";

const SYNCED_DATA_APP_SLUGS = ["good", "broken-bundle"];

type DataAppResourceIds = {
  resourceCollectionEntityId: string;
  permissionGroupEntityId: string;
};

export const copySyncedDataAppsFixture = () =>
  cy.task("copyDirectory", {
    source: SYNCED_DATA_APPS_FIXTURE_PATH,
    destination: LOCAL_GIT_PATH,
  });

export const provisionSyncedDataAppResources = () =>
  cy
    .wrap<string[]>(SYNCED_DATA_APP_SLUGS)
    .each((slug: string) =>
      createSyncedDataAppResources(slug).then((resourceIds) =>
        writeSyncedDataAppResourceIds(slug, resourceIds),
      ),
    );

const createSyncedDataAppResources = (
  slug: string,
): Cypress.Chainable<DataAppResourceIds> =>
  cy
    .request<{ entity_id: string }>("POST", "/api/collection", {
      name: `Data App: ${slug}`,
    })
    .then(({ body: { entity_id: resourceCollectionEntityId } }) =>
      cy
        .request<{ entity_id: string }>("POST", "/api/permissions/group", {
          name: `Data App: ${slug}`,
        })
        .then(({ body: { entity_id: permissionGroupEntityId } }) => ({
          resourceCollectionEntityId,
          permissionGroupEntityId,
        })),
    );

function writeSyncedDataAppResourceIds(
  slug: string,
  { resourceCollectionEntityId, permissionGroupEntityId }: DataAppResourceIds,
) {
  const manifestPath = `${LOCAL_GIT_PATH}/data_apps/${slug}/data_app.yaml`;

  return cy
    .readFile(manifestPath)
    .then((manifest) =>
      cy.writeFile(
        manifestPath,
        `${manifest}resource_collection_entity_id: ${resourceCollectionEntityId}\npermission_group_entity_id: ${permissionGroupEntityId}\n`,
      ),
    );
}
