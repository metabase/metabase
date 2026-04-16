import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";

const CUSTOM_VIZ_DEV_PROJECT_NAME = "custom-viz-dev-plugin";
const CUSTOM_VIZ_DEV_PORT = 5174;
const TIMEOUT = 120000;

const { H } = cy;

describe("development mode", () => {
  const tmpDir = `${Cypress.config("projectRoot")}/e2e/tmp`;
  const sdkDir = `${Cypress.config("projectRoot")}/enterprise/frontend/src/custom-viz`;
  const cliPath = `${sdkDir}/dist/cli.js`;
  const projectDir = `${tmpDir}/${CUSTOM_VIZ_DEV_PROJECT_NAME}`;
  const devUrl = `http://localhost:${CUSTOM_VIZ_DEV_PORT}`;
  const pluginSrcPath = `${projectDir}/src/index.tsx`;
  let devServerPid: number | null = null;

  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  before(() => {
    cy.exec(`mkdir -p ${tmpDir}`);
    cy.log("Build the SDK so we can use the repo-local CLI");
    cy.exec(`cd "${sdkDir}" && bun install && bun run build`, {
      timeout: TIMEOUT,
    });

    // Scaffold the boilerplate plugin using the init CLI command.
    cy.exec(`rm -rf "${projectDir}"`, { timeout: TIMEOUT });
    cy.exec(
      `cd "${tmpDir}" && node "${cliPath}" init "${CUSTOM_VIZ_DEV_PROJECT_NAME}"`,
      {
        timeout: TIMEOUT,
      },
    );

    // The scaffolded template requires Metabase >= 60.0, but the e2e runner may
    // run an older version. Rewrite the manifest to a permissive range so the
    // dev-only plugin is included in /api/ee/custom-viz-plugin/list and becomes
    // selectable in the visualization picker.
    cy.readFile(`${projectDir}/metabase-plugin.json`).then((manifest) => {
      cy.writeFile(
        `${projectDir}/metabase-plugin.json`,
        JSON.stringify(
          {
            ...manifest,
            metabase: {
              ...(manifest?.metabase ?? {}),
              version: ">=1.59",
            },
          },
          null,
          2,
        ),
      );
    });

    // Install dependencies in the tmp plugin folder.
    cy.exec(`cd "${projectDir}" && npm i`, { timeout: TIMEOUT });

    // Start the plugin dev server and keep it running
    cy.task<{ pid: number }>("startCustomVizDevServer", {
      cwd: projectDir,
    }).then(({ pid }) => {
      devServerPid = pid;
    });
  });

  after(() => {
    if (devServerPid == null) {
      return;
    }

    cy.task("stopCustomVizDevServer", devServerPid);
  });

  it("should load a dev-only plugin from a local dev server URL and use it in a question", () => {
    H.visitCustomVizDevelopment();

    cy.findByLabelText(/Dev server URL/).type(devUrl);
    cy.log(
      "It should not be possible to add the plugin until the user understands the risks",
    );
    cy.findByRole("button", { name: /Add/ }).should("be.disabled");
    cy.findByLabelText(/I understand/).click();

    cy.findByRole("button", { name: /Add/ }).click();

    cy.log("Verify the dev plugin is registered.");
    H.main().findByText(CUSTOM_VIZ_DEV_PROJECT_NAME).should("be.visible");

    // Use the dev plugin in a question (Count of Orders) — this yields a
    // single numeric value so the scaffolded plugin renders.
    H.createQuestion(
      {
        name: "Custom Viz Dev Mode Question Test",
        query: {
          "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("custom-viz-plugins-toggle").click();
    cy.log("Checking if dev badge is visible");
    cy.findByLabelText(
      "This is a development version of the visualization",
    ).should("exist");
    cy.findByTestId(`${CUSTOM_VIZ_DEV_PROJECT_NAME}-button`).click();

    // Close the picker so the viz is visible.
    cy.findByTestId("viz-type-button").click();

    cy.log(
      "Threshold defaults to 0 and Count(Orders) is > 0, so we should see 👍",
    );
    H.main().findByText("👍").should("be.visible");

    cy.log("Modifying plugin source");
    cy.readFile(pluginSrcPath).then((src) => {
      const updated = src.replace('"👍"', '"🥦"');
      if (updated === src) {
        throw new Error(`Expected to replace 👍 in ${pluginSrcPath}`);
      }
      cy.writeFile(pluginSrcPath, updated);
    });

    cy.log("Checking if hot reload works");
    H.main().findByText("🥦").should("be.visible");

    cy.log("Verify plugin settings affect rendering.");
    cy.log("Set threshold higher than Count(Orders) so it flips to 👎.");
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar")
      .findByPlaceholderText("Set threshold")
      .clear()
      .type("100000")
      .should("have.value", "100000");
    cy.findByRole("button", {
      name: /Done/,
    }).click();
    H.main().findByText("👎").should("be.visible");

    cy.log(
      "Saving the question and reloading to verify persistence of settings and dev URL",
    );
    H.main().findByRole("button", { name: /Save/ }).click();
    cy.findByRole("dialog", { name: /Save question/ }).within(() => {
      cy.findByRole("button", { name: /Save/ }).click();
    });
    // Wait for the dialog to close
    cy.findByRole("dialog", { name: /Save question/ }).should("not.exist");
    cy.reload();
    H.main().findByText("👎").should("be.visible");
  });
});
