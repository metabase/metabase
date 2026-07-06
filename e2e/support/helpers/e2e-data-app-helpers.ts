import { getIframeBody } from "./e2e-embedding-helpers";
import { LOCAL_GIT_PATH } from "./e2e-remote-sync-helpers";

type SeedDataAppOptions = {
  name?: string;
};

/**
 * Build the data-app fixture `appName` (its committed `src/` layered over the
 * `create-data-app` template base) with the Vite API, then drop it into the
 * connected git repo as `data_apps/<slug>/` and commit — ready for a
 * remote-sync pull to materialize it. The slug is the fixture directory name.
 *
 * Fixtures live in `e2e/support/assets/data-apps/<appName>/src/`; everything
 * else is generated here and never committed.
 */
export function seedDataApp(
  appName: string,
  { name = appName }: SeedDataAppOptions = {},
) {
  const slug = appName;
  const appRepoDir = `${LOCAL_GIT_PATH}/data_apps/${slug}`;

  return cy.task<string>("buildDataApp", { appName }).then((code) => {
    cy.writeFile(
      `${appRepoDir}/data_app.yml`,
      `name: ${name}\nslug: ${slug}\npath: dist/index.js\n`,
    );
    cy.writeFile(`${appRepoDir}/dist/index.js`, code);
    cy.exec(
      `git -C ${LOCAL_GIT_PATH} add .; git -C ${LOCAL_GIT_PATH} commit -m 'Add ${slug} data app'`,
    );
  });
}

/** Open a materialized data app at `/data-app/:slug`. */
export function openDataApp(slug: string) {
  return cy.visit(`/data-app/${slug}`);
}

/**
 * The body of a data app's sandboxed iframe, selected by its display name (the
 * host sets the iframe `title` to the app's display name). Same-origin, so
 * Cypress can reach into it.
 */
export function dataAppIframe(displayName: string) {
  return getIframeBody(`iframe[title="${displayName}"]`);
}
