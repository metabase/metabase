import { USERS } from "e2e/support/cypress_data";
import { LOGIN_CACHE } from "e2e/support/cypress_sample_instance_data";

declare global {
  namespace Cypress {
    interface Chainable {
      signIn: (user?: keyof typeof USERS) => void;
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

// Load login cache from sample instance data
if (Object.keys(LOGIN_CACHE).length) {
  Object.entries(LOGIN_CACHE).forEach(([user, { sessionId, deviceId }]) => {
    loginCache[user] = { sessionId, deviceId };
  });
}

Cypress.Commands.add("signIn", (user = "admin") => {
  if (loginCache[user]) {
    const { sessionId, deviceId } = loginCache[user];
    cy.log("Using cached login token for user", user);
    cy.setCookie("metabase.SESSION", sessionId, { httpOnly: true });
    cy.setCookie("metabase.TIMEOUT", "alive");
    cy.setCookie("metabase.DEVICE", deviceId ?? "", { httpOnly: true });
    return;
  }

  cy.log(`Logging in as ${user}`);

  const { email: username, password } = USERS[user];
  cy.request("POST", "/api/session", { username, password }).then(response => {
    cy.log("saving login token for user", user);
    cy.getCookie("metabase.DEVICE").then(deviceCookie => {
      loginCache[user] = {
        sessionId: response.body.id,
        deviceId: deviceCookie?.value ?? "my-device-id",
      };
    });
  });
});

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
