import { USERS } from "e2e/support/cypress_data";
declare global {
  namespace Cypress {
    interface Chainable {
      signIn: (user?: keyof typeof USERS, options?: LoginOptions) => void;
      signInAsAdmin: () => void;
      signInAsNormalUser: () => void;
      signInAsSandboxedUser: () => void;
      signInAsImpersonatedUser: () => void;
      signOut: () => void;
    }
  }
}

export const loginCache: Partial<
  Record<
    keyof typeof USERS,
    {
      sessionId: string;
      deviceId: string;
    }
  >
> = {};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sampleDataFile = require("e2e/support/cypress_sample_instance_data.json");
  const { loginCache: LOGIN_CACHE } = sampleDataFile;

  // Load login cache from sample instance data
  if (Object.keys(LOGIN_CACHE).length) {
    Object.entries(LOGIN_CACHE).forEach(([user, { sessionId, deviceId }]) => {
      loginCache[user] = { sessionId, deviceId };
    });
  }
} catch (e) {
  console.warn("No login cache found in cypress_sample_instance_data");
}

type LoginOptions = {
  setupCache?: boolean;
  skipCache?: boolean;
};

Cypress.Commands.add(
  "signIn",
  (
    user = "admin",
    { setupCache, skipCache } = { setupCache: false, skipCache: false },
  ) => {
    if (!skipCache && !setupCache && loginCache[user]) {
      const { sessionId, deviceId } = loginCache[user];
      cy.log("Using cached login token for user", user);
      cy.setCookie("metabase.SESSION", sessionId, { httpOnly: true });
      cy.setCookie("metabase.TIMEOUT", "alive");
      cy.setCookie("metabase.DEVICE", deviceId ?? "", { httpOnly: true });
      return;
    }

    cy.log(`Logging in as ${user}`);

    const { email: username, password } = USERS[user];
    cy.request("POST", "/api/session", { username, password }).then(
      response => {
        if (setupCache) {
          cy.log("saving login token for user", user);
          cy.getCookie("metabase.DEVICE").then(deviceCookie => {
            loginCache[user] = {
              sessionId: response.body.id,
              deviceId: deviceCookie?.value ?? "my-device-id",
            };
          });
        }
      },
    );
  },
);

Cypress.Commands.add("signInAsAdmin", () => {
  return cy.signIn("admin");
});

Cypress.Commands.add("signInAsNormalUser", () => {
  cy.signIn("normal");
});

Cypress.Commands.add("signInAsSandboxedUser", () => {
  cy.signIn("sandboxed");
});

Cypress.Commands.add("signInAsImpersonatedUser", () => {
  cy.signIn("impersonated");
});

Cypress.Commands.add("signOut", () => {
  cy.log("Signing out");
  cy.clearCookie("metabase.SESSION");
});
