import { USER_GROUPS } from "e2e/support/cypress_data";

const { H } = cy;

const { ALL_USERS_GROUP, ADMIN_GROUP } = USER_GROUPS;

const APP_NAME = "escape";
const APP_DISPLAY_NAME = "Escape";

// A distinctive address the hostile bundle tries to provision as an admin. If it
// ever exists after a test, the sandbox was escaped.
const VICTIM_EMAIL = "sandbox-escape-victim@evil.test";

type EscapeTestEnv = {
  target: string;
  instanceUrl: string;
  payload: Record<string, unknown>;
};

const inviteAdminPayload = () => ({
  email: VICTIM_EMAIL,
  first_name: "Sandbox",
  last_name: "Escape",
  // All Users (1) is implicit and must be present, or the backend rejects the
  // create as an attempt to remove someone from it. Admin (2) is the escalation.
  user_group_memberships: [
    { id: ALL_USERS_GROUP, is_group_manager: false },
    { id: ADMIN_GROUP, is_group_manager: false },
  ],
});

describe("scenarios > data apps > sandbox escape (security)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  const setUpEscape = () => {
    const instanceUrl = Cypress.config("baseUrl") ?? "";

    const testEnv: EscapeTestEnv = {
      target: `${instanceUrl}/api/user`,
      instanceUrl,
      payload: inviteAdminPayload(),
    };

    H.mockDataApp(APP_NAME, { displayName: APP_DISPLAY_NAME, testEnv });

    H.openDataApp(APP_NAME);
  };

  // Click the vector's button, then wait for the bundle to report its outcome.
  const runEscape = (buttonTestId: string) => {
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId(buttonTestId).click();
      cy.findByTestId("escape-result", { timeout: 30000 })
        .should("not.have.text", "pending")
        .invoke("text")
        .then((text) => cy.log(`escape-result: ${text}`));
    });
  };

  // Ground truth: the untrusted bundle must not have been able to create the user.
  const assertVictimNotCreated = () => {
    cy.request(
      "GET",
      `/api/user?query=${encodeURIComponent(VICTIM_EMAIL)}`,
    ).then(({ body }) => {
      const emails = (body?.data ?? []).map(
        (user: { email: string }) => user.email,
      );
      expect(emails, "a user was provisioned via the escape").to.not.include(
        VICTIM_EMAIL,
      );
    });
  };

  it("does not escape via a document.createElement about:blank iframe", () => {
    setUpEscape();
    runEscape("escape-create-element");
    assertVictimNotCreated();
  });

  it("does not escape via a host-React about:blank iframe", () => {
    setUpEscape();
    runEscape("escape-react-about-blank");
    assertVictimNotCreated();
  });

  it("does not escape via an iframe pointing at Metabase itself", () => {
    setUpEscape();
    runEscape("escape-react-src");
    assertVictimNotCreated();
  });

  it("does not escape via a srcdoc iframe", () => {
    setUpEscape();
    runEscape("escape-react-srcdoc");
    assertVictimNotCreated();
  });

  it("does not escape by replacing the SDK bundle global", () => {
    setUpEscape();
    runEscape("escape-replace-bundle");
    assertVictimNotCreated();
  });

  it("does not escape by mutating the SDK bundle object", () => {
    setUpEscape();
    runEscape("escape-mutate-bundle");
    assertVictimNotCreated();
  });

  it("does not escape by smuggling an element through mediated props", () => {
    setUpEscape();
    runEscape("escape-props-smuggle");
    assertVictimNotCreated();
  });

  it("does not escape by smuggling an element via a guest errorComponent", () => {
    setUpEscape();
    runEscape("escape-error-component");
    assertVictimNotCreated();
  });

  it("does not escape by fetching from a guest errorComponent rendered host-side", () => {
    setUpEscape();
    runEscape("escape-error-component-fetch");
    assertVictimNotCreated();
  });

  it("does not escape by planting a component in the host store via dispatch", () => {
    setUpEscape();
    runEscape("escape-store-dispatch");
    assertVictimNotCreated();
  });

  it("does not escape via dangerouslySetInnerHTML rendered host-side", () => {
    setUpEscape();
    runEscape("escape-inner-html");
    assertVictimNotCreated();
  });

  it("does not escape via the host window reached from a ref", () => {
    setUpEscape();
    runEscape("escape-ref-host-window");
    assertVictimNotCreated();
  });
});
