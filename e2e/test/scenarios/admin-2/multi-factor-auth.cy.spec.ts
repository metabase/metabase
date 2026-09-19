const { H } = cy;
import * as OTPAuth from "otpauth";

import { USERS } from "e2e/support/cypress_data";
import { dayjs } from "metabase/dayjs";

const { admin, nodata, normal } = USERS;

const GRACE_PERIOD_DAYS = 14;

describe("scenarios > admin > settings > multi-factor authentication", () => {
  beforeEach(() => {
    H.restore();
    H.clearInbox();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    // Every enforcement change writes the deadline alongside it, so it lands on the bulk route.
    cy.intercept("PUT", "/api/setting").as("updateSettings");
    cy.intercept("POST", "/api/ee/mfa/enroll").as("enroll");
  });

  describe("optional", () => {
    describe("admin settings", () => {
      it("admin can enable and disable 2FA in authentication settings", () => {
        cy.visit("/admin/settings/authentication");
        mfaSetting().scrollIntoView();
        mfaSetting()
          .findByText("Two-factor authentication")
          .should("be.visible");
        mfaToggle().should("not.be.checked").click();
        cy.wait("@updateSettings");
        mfaSetting()
          .should("contain", "0 enrolled users")
          .and("contain", "users without 2FA");

        cy.log("Enabling it leaves enforcement optional");
        enforcementOption("Don't require").should("be.checked");

        cy.log("Disable it again");
        mfaToggle().should("be.checked").click();
        cy.wait("@updateSettings");
        mfaToggle().should("not.be.checked");
        mfaSetting().should("not.contain", "enrolled");
      });

      it("admin can search the users-without-2FA list", () => {
        enableMfa();
        enrollUser();

        cy.signInAsAdmin();
        cy.visit("/admin/settings/authentication");
        mfaSetting()
          .scrollIntoView()
          .findByText(/users? without 2FA/)
          .click();

        cy.log(
          "The enrolled user is absent — they already have a second factor",
        );
        unenrolledUsersTable().should("not.contain", normal.email);

        cy.log("Searching narrows to a single person");
        unenrolledUsersTable().should("contain", nodata.email);
        cy.findByPlaceholderText("Search…").type(admin.first_name);
        unenrolledUsersTable()
          .should("contain", admin.email)
          .and("not.contain", nodata.email);
      });
    });

    describe("enrollment", () => {
      it("user can disable 2FA themselves and re-enroll", () => {
        enableMfa();
        enrollUser().then(({ secret }) => {
          cy.log(
            "Disabling requires a fresh second factor, not just a password",
          );
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
        enrollViaUI();
        cy.findByRole("button", { name: "Disable" }).should("be.visible");
      });
    });
  });

  describe("required", () => {
    describe("admin", () => {
      it("allows user to set mfa to required, sets default grace period", () => {
        const deadline = dayjs().add(GRACE_PERIOD_DAYS, "day");

        cy.visit("/admin/settings/authentication");
        mfaSetting().scrollIntoView();

        cy.log("Enforcement and the deadline only exist once 2FA is allowed");
        mfaSetting().should("not.contain", "Require now");
        mfaDeadline().should("not.exist");

        mfaToggle().should("not.be.checked").click();
        cy.wait("@updateSettings");

        // Because the admin has not enrolled, they cannot set two factor to required
        enforcementOption("Require by a certain date").should("be.disabled");
        mfaSetting()
          .findByText(/account before requiring it/)
          .should("be.visible");

        enrollUser("admin");
        cy.reload();

        cy.log(
          "Enforcement and a default two-week grace period are saved together",
        );
        enforcementOption("Require by a certain date").click();
        cy.wait("@updateSettings");

        mfaDeadline().should("have.value", deadline.format("MMMM D, YYYY"));
      });
    });
  });
});

function unenrolledUsersTable() {
  return cy.findByTestId("mfa-unenrolled-users-table");
}

function mfaSetting() {
  return cy.findByTestId("mfa-setting");
}

function mfaToggle() {
  return mfaSetting().findByLabelText("Allow two-factor authentication");
}

/** One of "Don't require", "Require now", "Require by a certain date". */
function enforcementOption(label: string) {
  return mfaSetting().findByLabelText(label);
}

function mfaDeadline() {
  return mfaSetting().findByLabelText("Enrollment deadline");
}

function enableMfa() {
  return cy.request("PUT", "/api/setting/mfa-enforcement", {
    value: "optional",
  });
}

function enrollUser(user: keyof typeof USERS = "normal") {
  cy.signIn(user);
  return cy
    .request("POST", "/api/ee/mfa/enroll", { password: USERS[user].password })
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

function enrollViaUI(): Cypress.Chainable<string> {
  cy.findByRole("button", {
    name: "Set up two-factor authentication",
  }).click();
  H.modal().within(() => {
    cy.findByLabelText("Confirm your password to begin").type(normal.password);
    cy.button("Continue").click();
  });
  return cy.wait("@enroll").then(({ response }) => {
    const secret = response?.body.secret;
    H.modal().within(() => {
      cy.findByLabelText(
        "Enter the 6-digit code from the authenticator app",
      ).type(generateTotpCode(secret, Date.now() / 1000));
      cy.button("Set up authentication").click();
      cy.findByText("Your recovery codes").should("be.visible");
      cy.button("Done").click();
    });
    return cy.wrap<string>(secret, { log: false });
  });
}

function generateTotpCode(secret: string, unixSeconds: number): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: unixSeconds * 1000 });
}
