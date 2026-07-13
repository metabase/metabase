const { H } = cy;
import * as OTPAuth from "otpauth";

import { USERS } from "e2e/support/cypress_data";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { normal } = USERS;

describe("scenarios > admin > settings > multi-factor authentication", () => {
  beforeEach(() => {
    H.restore();
    cy.request("POST", "/api/testing/reset-throttlers");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("PUT", "/api/setting/mfa-enforcement").as("updateEnforcement");
    cy.intercept("POST", "/api/ee/mfa/enroll").as("enroll");
  });

  it("admin can enable and disable 2FA in authentication settings", () => {
    cy.visit("/admin/settings/authentication");
    mfaSetting().scrollIntoView();
    mfaSetting().within(() => {
      cy.findByText("Two-factor authentication").should("be.visible");
      mfaToggle().should("not.be.checked").click();
    });
    cy.wait("@updateEnforcement");
    mfaSetting()
      .should("contain", "0 enrolled users")
      .and("contain", "users without 2FA");

    cy.log("Disable it again");
    mfaSetting().within(() => {
      mfaToggle().should("be.checked").click();
    });
    cy.wait("@updateEnforcement");
    mfaSetting().within(() => {
      mfaToggle().should("not.be.checked");
    });
    mfaSetting().should("not.contain", "enrolled");
  });

  it("user can set up 2FA in account settings and sign in with an authenticator code", () => {
    let totpSecret = "";

    enableMfa();

    cy.log("User enrolls from account security settings");
    cy.signInAsNormalUser();
    cy.visit("/account/security");
    cy.findByTestId("account-header")
      .findByRole("tab", { name: "Security" })
      .should("be.visible");
    cy.findByRole("button", {
      name: "Set up two-factor authentication",
    }).click();
    H.modal().within(() => {
      cy.findByLabelText("Confirm your password to begin").type(
        normal.password,
      );
      cy.button("Continue").click();
    });

    cy.wait("@enroll").then(({ response }) => {
      totpSecret = response?.body.secret;
    });
    cy.then(() => generateTotpCode(totpSecret, Date.now() / 1000)).then(
      (code) => {
        H.modal().within(() => {
          cy.findByLabelText(
            "Enter the 6-digit code from the authenticator app",
          ).type(code);
          cy.button("Set up authentication").click();
        });
      },
    );

    cy.log("Recovery codes are shown exactly once on enrollment");
    H.modal().within(() => {
      cy.findByText("Your recovery codes").should("be.visible");
      cy.button("Done").click();
    });
    cy.findByRole("button", { name: "Disable" }).should("be.visible");
    cy.findByRole("button", { name: "Generate recovery codes" }).should(
      "be.visible",
    );

    cy.log("Signing in now requires an authenticator code");
    signInWithPassword();
    cy.findByTestId("login-page")
      .findByText("Enter the 6-digit code from your authenticator app.")
      .should("be.visible");

    cy.then(() => generateTotpCode(totpSecret, Date.now() / 1000 + 30)).then(
      (code) => {
        cy.findByLabelText("Authenticator code").type(code);
      },
    );
    cy.button("Verify").click();
    cy.findByTestId("greeting-message").should("be.visible");
  });

  it("user can disable 2FA themselves and re-enroll", () => {
    enableMfa();
    enrollNormalUser().then(({ secret }) => {
      cy.log("Disabling requires a fresh second factor, not just a password");
      cy.visit("/account/security");
      cy.findByRole("button", { name: "Disable" }).click();
      H.modal().within(() => {
        cy.findByText(
          "Are you sure you want to disable two-factor authentication? Your account will be protected by your password only, and your recovery codes will stop working.",
        ).should("be.visible");
        cy.findByLabelText(
          "Confirm with an authenticator code or a recovery code",
        ).type(generateTotpCode(secret, Date.now() / 1000 + 30));
        cy.button("Disable").click();
      });
    });
    cy.findByRole("button", {
      name: "Set up two-factor authentication",
    }).should("be.enabled");

    cy.log("Re-enroll from scratch with a new secret");
    cy.findByRole("button", {
      name: "Set up two-factor authentication",
    }).click();
    H.modal().within(() => {
      cy.findByLabelText("Confirm your password to begin").type(
        normal.password,
      );
      cy.button("Continue").click();
    });
    cy.wait("@enroll").then(({ response }) => {
      const newSecret = response?.body.secret;
      H.modal().within(() => {
        cy.findByLabelText(
          "Enter the 6-digit code from the authenticator app",
        ).type(generateTotpCode(newSecret, Date.now() / 1000));
        cy.button("Set up authentication").click();
        cy.findByText("Your recovery codes").should("be.visible");
        cy.button("Done").click();
      });
    });
    cy.findByRole("button", { name: "Disable" }).should("be.visible");
  });

  it("recovery codes sign the user in once and regeneration invalidates the old set", () => {
    enableMfa();
    cy.intercept("POST", "/api/ee/mfa/recovery-codes").as("regenerate");

    enrollNormalUser().then(({ secret, recoveryCodes }) => {
      cy.log("Sign in with a recovery code instead of an authenticator code");
      signInWithPassword();
      cy.findByTestId("login-page")
        .findByText("Use a recovery code instead")
        .click();
      cy.findByLabelText("Recovery code").type(recoveryCodes[0]);
      cy.button("Verify").click();
      cy.findByTestId("greeting-message").should("be.visible");

      cy.log("Regenerate the recovery codes");
      cy.visit("/account/security");
      cy.findByRole("button", { name: "Generate recovery codes" }).click();
      H.modal().within(() => {
        cy.findByText(
          "This will generate a new set of recovery codes and invalidate all of your old ones.",
        ).should("be.visible");
        cy.findByLabelText(
          "Confirm with an authenticator code or a recovery code",
        ).type(generateTotpCode(secret, Date.now() / 1000 + 30));
        cy.button("Generate new codes").click();
        cy.findByText("Your recovery codes").should("be.visible");
        cy.button("Done").click();
      });

      cy.log("Old codes no longer work; new ones do");
      cy.wait("@regenerate").then(({ response }) => {
        const newCodes = response?.body.recovery_codes;
        signInWithPassword();
        cy.findByTestId("login-page")
          .findByText("Use a recovery code instead")
          .click();
        cy.findByLabelText("Recovery code").type(recoveryCodes[1]);
        cy.button("Verify").click();
        cy.findByTestId("login-page")
          .findByRole("alert")
          .should("contain", "Invalid authentication code.");
        cy.findByLabelText("Recovery code").clear().type(newCodes[0]);
        // the submit button reads "Failed" for a few seconds after the
        // rejected attempt before reverting to "Verify"
        cy.button("Verify", 10000).click();
        cy.findByTestId("greeting-message").should("be.visible");
      });
    });
  });

  it("an emailed one-time code works as a fallback second factor", () => {
    enableMfa();
    H.setupSMTP();
    enrollNormalUser();

    signInWithPassword();
    cy.findByTestId("login-page")
      .findByText("Enter the 6-digit code from your authenticator app.")
      .should("be.visible");

    H.clearInbox();
    cy.findByTestId("login-page").findByText("Email me a code").click();
    cy.findByTestId("login-page")
      .findByText("Code sent — check your email")
      .should("be.visible");

    H.getInbox().then(({ body: emails }: { body: any[] }) => {
      const otpEmail = emails.find((email) =>
        email.subject.includes("Your sign-in code"),
      );
      expect(otpEmail, "sign-in code email").to.exist;
      const [, code] = otpEmail.html.match(/>\s*(\d{6})\s*</);
      cy.findByLabelText("Authenticator code").type(code);
    });
    cy.button("Verify").click();
    cy.findByTestId("greeting-message").should("be.visible");
  });

  it("admin can remove a user's enrollment to unlock them", () => {
    enableMfa();
    enrollNormalUser();

    cy.log("Admin sees the enrollment and removes it (lockout escape hatch)");
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication");
    mfaSetting().scrollIntoView().should("contain", "1 enrolled user");
    cy.request("POST", "/api/ee/mfa/admin/remove", {
      user_id: NORMAL_USER_ID,
    });

    cy.log("After the reset the user signs in with just a password");
    signInWithPassword();
    cy.findByTestId("greeting-message").should("be.visible");
    cy.url().should("not.contain", "/auth/login");
  });
});

function mfaSetting() {
  return cy.findByTestId("mfa-setting");
}

function mfaToggle() {
  return cy.findByLabelText(/Enabled|Disabled/);
}

function enableMfa() {
  return cy.request("PUT", "/api/setting/mfa-enforcement", {
    value: "optional",
  });
}

function enrollNormalUser() {
  cy.signInAsNormalUser();
  return cy
    .request("POST", "/api/ee/mfa/enroll", { password: normal.password })
    .then(({ body: { secret } }) =>
      cy
        .request("POST", "/api/ee/mfa/enroll/confirm", {
          code: generateTotpCode(secret, Date.now() / 1000),
        })
        .then(({ body: { recovery_codes } }) => ({
          secret,
          recoveryCodes: recovery_codes,
        })),
    );
}

function signInWithPassword() {
  cy.signOut();
  cy.visit("/auth/login");
  cy.findByLabelText("Email address").type(normal.email);
  cy.findByLabelText("Password").type(normal.password);
  cy.button("Sign in").click();
}

function generateTotpCode(secret: string, unixSeconds: number): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: unixSeconds * 1000 });
}
