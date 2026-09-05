const { H } = cy;
import * as OTPAuth from "otpauth";

import { USERS } from "e2e/support/cypress_data";
import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { dayjs } from "metabase/dayjs";

const { admin, nodata, normal } = USERS;

const NEW_PASSWORD = "NewPassword2fa!123";

const GRACE_PERIOD_DAYS = 14;

const LDAP_USER = { username: "user01@example.org", password: "123456" };

/** mock-saml accepts any username and password, but only example.com/example.org domains. */
const SAML_USER = { username: "samluser", domain: "example.com" };
const SAML_USER_EMAIL = `${SAML_USER.username}@${SAML_USER.domain}`;

type MaildevEmail = { subject: string; html: string };

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

      it("admin can remove a user's enrollment to unlock them", () => {
        enableMfa();
        enrollUser();

        cy.log(
          "Admin drills into the enrolled list from the count on the card",
        );
        cy.signInAsAdmin();
        cy.visit("/admin/settings/authentication");
        mfaSetting().scrollIntoView().findByText("1 enrolled user").click();

        enrolledUsersTable()
          .should("contain", normal.first_name)
          .and("contain", normal.email);

        cy.log("Admin removes the enrollment (the lockout escape hatch)");
        cy.findByLabelText(
          `Actions for ${normal.first_name} ${normal.last_name}`,
        ).click();
        H.menu().findByText("Remove two-factor authentication").click();
        H.modal().within(() => {
          cy.findByText(
            `Remove two-factor authentication for ${normal.first_name} ${normal.last_name}?`,
          ).should("be.visible");
          cy.button("Remove").click();
        });

        cy.log("They drop off the enrolled list and the count follows");
        enrolledUsersTable().should("not.contain", normal.email);
        cy.visit("/admin/settings/authentication");
        mfaSetting().scrollIntoView().should("contain", "0 enrolled users");

        cy.log("And they now show up as needing to set 2FA up again");
        mfaSetting()
          .findByText(/users? without 2FA/)
          .click();
        unenrolledUsersTable().should("contain", normal.email);

        cy.log("After the removal the user signs in with just a password");
        signInWithPassword();
        cy.findByTestId("greeting-message").should("be.visible");
        cy.url().should("not.contain", "/auth/login");
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
      it("user can set up 2FA in account settings and sign in with an authenticator code", () => {
        let totpSecret = "";

        enableMfa();

        cy.log("User enrolls from account security settings");
        cy.signInAsNormalUser();
        cy.visit("/account/security");
        cy.findByTestId("account-header")
          .findByRole("tab", { name: "Authentication" })
          .should("be.visible");
        enrollViaUI().then((secret) => {
          totpSecret = secret;
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
        // The backend rejects a reused TOTP time step, so take the code for the
        // next 30-second window — validation accepts one step of clock skew.
        cy.then(() =>
          generateTotpCode(totpSecret, Date.now() / 1000 + 30),
        ).then((code) => {
          cy.findByLabelText("Authenticator code").type(code);
        });
        cy.button("Verify").click();
        cy.findByTestId("greeting-message").should("be.visible");
      });

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

    describe("login flows", () => {
      it("recovery codes sign the user in once and regeneration invalidates the old set", () => {
        enableMfa();
        cy.intercept("POST", "/api/ee/mfa/recovery-codes").as("regenerate");

        enrollUser().then(({ secret, recoveryCodes }) => {
          cy.log(
            "Sign in with a recovery code instead of an authenticator code",
          );
          signInWithPassword();
          cy.findByTestId("login-page")
            .findByText("Use a recovery code instead")
            .click();
          cy.findByLabelText("Recovery code").type(recoveryCodes[0]);
          cy.button("Verify").click();
          cy.findByTestId("greeting-message").should("be.visible");

          cy.log("Regenerate the recovery codes");
          cy.visit("/account/authentication");
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
            // the submit button transiently reads "Failed" after the rejected
            // attempt but stays clickable, so match either label
            cy.button(/Verify|Failed/).click();
            cy.findByTestId("greeting-message").should("be.visible");
          });
        });
      });

      it("an emailed one-time code works as a fallback second factor", () => {
        enableMfa();
        H.setupSMTP();
        enrollUser();

        signInWithPassword();
        cy.findByTestId("login-page")
          .findByText("Enter the 6-digit code from your authenticator app.")
          .should("be.visible");

        cy.findByTestId("login-page").findByText("Email me a code").click();
        cy.findByTestId("login-page")
          .findByText("Code sent — check your email")
          .should("be.visible");

        H.getInbox().then(({ body: emails }: { body: MaildevEmail[] }) => {
          const otpEmail = emails.find((email) =>
            email.subject.includes("Your sign-in code"),
          );
          expect(otpEmail, "sign-in code email").to.exist;
          const code = otpEmail?.html.match(/>\s*(\d{6})\s*</)?.[1];
          expect(code, "6-digit code in the email body").to.be.a("string");
          cy.findByLabelText("Authenticator code").type(String(code));
        });
        cy.button("Verify").click();
        cy.findByTestId("greeting-message").should("be.visible");
      });

      it("resetting a forgotten password does not bypass the second factor", () => {
        enableMfa();
        H.setupSMTP();
        enrollUser().then(({ secret }) => {
          cy.log("Request a reset link and set a new password");
          cy.signOut();
          cy.visit("/auth/forgot_password");
          cy.findByLabelText("Email address").type(normal.email);
          cy.button("Send password reset email").click();
          cy.findByTestId("login-page")
            .findByText(/If the email exists/)
            .should("be.visible");

          // the reset email is sent asynchronously and lands next to the "2FA
          // enabled" notification from enrollment — wait for both to be there
          H.getInbox(2).then(({ body: emails }: { body: MaildevEmail[] }) => {
            const resetEmail = emails.find((email) =>
              email.subject.includes("Password Reset"),
            );
            expect(resetEmail, "password reset email").to.exist;
            cy.visit(getResetLink(String(resetEmail?.html)));
          });
          cy.findByLabelText("Create a password").type(NEW_PASSWORD);
          cy.findByLabelText("Confirm your password").type(NEW_PASSWORD);
          cy.button("Save new password").click();

          cy.log("No session is minted — the new password still needs a code");
          cy.url().should("contain", "/auth/login");
          cy.findByLabelText("Email address").type(normal.email);
          cy.findByLabelText("Password").type(NEW_PASSWORD);
          cy.button("Sign in").click();
          cy.findByTestId("login-page")
            .findByText("Enter the 6-digit code from your authenticator app.")
            .should("be.visible");
          cy.then(() => generateTotpCode(secret, Date.now() / 1000 + 30)).then(
            (code) => {
              cy.findByLabelText("Authenticator code").type(code);
            },
          );
          cy.button("Verify").click();
          cy.findByTestId("greeting-message").should("be.visible");
        });
      });

      it("an enrolled user is still challenged and can disable 2FA after the license lapses", () => {
        enableMfa();
        enrollUser().then(({ secret, recoveryCodes }) => {
          cy.log("Drop the premium token — the gate must fail closed");
          cy.signInAsAdmin();
          H.deleteToken();

          signInWithPassword();
          cy.findByTestId("login-page")
            .findByText("Enter the 6-digit code from your authenticator app.")
            .should("be.visible");
          cy.then(() => generateTotpCode(secret, Date.now() / 1000 + 30)).then(
            (code) => {
              cy.findByLabelText("Authenticator code").type(code);
            },
          );
          cy.button("Verify").click();
          cy.findByTestId("greeting-message").should("be.visible");

          cy.log(
            "Managing the existing enrollment still works without a license",
          );
          cy.visit("/account/security");
          cy.findByRole("button", { name: "Disable" }).click();
          H.modal().within(() => {
            cy.findByLabelText(
              "Confirm with an authenticator code or a recovery code",
            ).type(recoveryCodes[0]);
            cy.button("Disable").click();
          });

          cy.log("Without the feature there is no way back into setup");
          cy.url().should("contain", "/account/authentication");
          cy.findByRole("button", {
            name: "Set up two-factor authentication",
          }).should("be.disabled");
        });
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

      it("should immediately invalidate current username / password sessions when enforcement is required", () => {
        cy.signInAsNormalUser();

        cy.visit("/");
        cy.findByTestId("greeting-message").should("be.visible");
        H.openNavigationSidebar();
        H.navigationSidebar().findByText("Our analytics").should("be.visible");

        cy.log("An admin turns enforcement on part-way through their session");
        cy.task("requestAsAdmin", {
          method: "PUT",
          url: "/api/setting",
          body: {
            "mfa-enforcement": "required",
            "mfa-requirement-deadline": null,
          },
        });

        cy.log("next api request should return unauthenticated");
        H.navigationSidebar().findByText("Our analytics").click();

        cy.log("should be brought to login screen");
        cy.findByRole("heading", { name: "Sign in to Metabase" }).should(
          "be.visible",
        );
      });

      it("should immediately invalidate current LDAP sessions when enforcement is required", () => {
        H.setupLdap();
        signInWithLdap();
        cy.findByTestId("greeting-message").should("be.visible");
        H.openNavigationSidebar();
        H.navigationSidebar()
          .findByText("Your personal collection")
          .should("be.visible");

        cy.log("An admin turns enforcement on part-way through their session");
        cy.task("requestAsAdmin", {
          method: "PUT",
          url: "/api/setting",
          body: {
            "mfa-enforcement": "required",
            "mfa-requirement-deadline": null,
          },
        });

        cy.log("next api request should return unauthenticated");
        H.navigationSidebar().findByText("Your personal collection").click();

        cy.log("should be brought to login screen");
        cy.findByRole("heading", { name: "Sign in to Metabase" }).should(
          "be.visible",
        );
      });

      it("should not invalidate sessions created via SAML, even when enforcement is required", () => {
        H.setupSaml();
        createSamlUser();

        cy.signOut();
        cy.visit("/auth/login");
        cy.button("Sign in with SSO").click();

        cy.log("The IdP takes over — any password works, the domain is fixed");
        cy.get("#username").type(SAML_USER.username);
        cy.get("#domain").select(SAML_USER.domain);
        cy.get("#password").type("anything");
        cy.get("button").click();

        cy.log("Straight in: SSO providers are exempt from the MFA gate");
        cy.findByTestId("greeting-message").should("be.visible");

        cy.log("An admin turns enforcement on part-way through their session");
        cy.task("requestAsAdmin", {
          method: "PUT",
          url: "/api/setting",
          body: {
            "mfa-enforcement": "required",
            "mfa-requirement-deadline": null,
          },
        });

        cy.log("The SAML session survives — the IdP owns MFA for those users");
        H.navigationSidebar().findByText("Our analytics").click();
        H.collectionTable().findByText("Orders, Count").click();
        cy.location("pathname").should(
          "contain",
          `/question/${ORDERS_COUNT_QUESTION_ID}`,
        );
        cy.findByTestId("login-page").should("not.exist");
      });
    });

    describe("login", () => {
      it("forces enrollment on login if grace period is past", () => {
        cy.intercept("POST", "/api/session").as("login");
        let secret = "";

        cy.log("Enforcement started yesterday, so the grace period is over");
        requireMfa({ deadline: daysFromNow(-1) });

        cy.log("A correct password on its own no longer yields a session");
        signInWithPassword();
        cy.wait("@login").then(({ response }) => {
          secret = response?.body.secret;
        });
        cy.findByTestId("login-page").within(() => {
          cy.findByText(
            "Two-factor authentication is required. Finish setting it up to sign in.",
          ).should("be.visible");
          cy.findByText("Or enter this key in the app manually:").should(
            "be.visible",
          );
        });

        cy.log("The key on screen is the one the login handed out");
        cy.then(() => {
          cy.findByTestId("login-page").should("contain", secret);
          cy.findByLabelText(
            "Enter the 6-digit code from the authenticator app",
          ).type(generateTotpCode(secret, Date.now() / 1000));
        });
        cy.button("Set up authentication").click();

        cy.log("Recovery codes are shown, and the user is still not signed in");
        cy.findByTestId("login-page")
          .findByText("Your recovery codes")
          .should("be.visible");
        cy.url().should("contain", "/auth/login");
        cy.findByTestId("greeting-message").should("not.exist");

        cy.log("Acknowledging the codes is what completes the login");
        cy.button("Done").click();
        cy.findByTestId("greeting-message").should("be.visible");
        cy.url().should("not.contain", "/auth/login");
      });
      it("does not require a challenge if within the grace period", () => {
        requireMfa({ deadline: daysFromNow(7) });

        signInWithPassword();
        cy.findByTestId("greeting-message").should("be.visible");
        cy.url().should("not.contain", "/auth/login");
      });

      it("resetting a forgotten password does not bypass enrollment", () => {
        cy.intercept("POST", "/api/session").as("login");
        H.setupSMTP();
        requireMfa();
        cy.log("Request a reset link and set a new password");
        cy.signOut();
        cy.visit("/auth/forgot_password");
        cy.findByLabelText("Email address").type(normal.email);
        cy.button("Send password reset email").click();
        cy.findByTestId("login-page")
          .findByText(/If the email exists/)
          .should("be.visible");

        H.getInbox(1).then(({ body: emails }: { body: MaildevEmail[] }) => {
          const resetEmail = emails.find((email) =>
            email.subject.includes("Password Reset"),
          );
          expect(resetEmail, "password reset email").to.exist;
          cy.visit(getResetLink(String(resetEmail?.html)));
        });
        cy.findByLabelText("Create a password").type(NEW_PASSWORD);
        cy.findByLabelText("Confirm your password").type(NEW_PASSWORD);
        cy.button("Save new password").click();

        cy.log("No session is minted — user must enroll in MFA");

        cy.url().should("contain", "/auth/login");
        cy.findByLabelText("Email address").type(normal.email);
        cy.findByLabelText("Password").type(NEW_PASSWORD);
        cy.button("Sign in").click();

        cy.wait("@login").then(({ response }) => {
          const secret = response?.body.secret;
          cy.findByTestId("login-page").should("contain", secret);
          cy.findByLabelText(
            "Enter the 6-digit code from the authenticator app",
          ).type(generateTotpCode(secret, Date.now() / 1000));
        });

        cy.button("Set up authentication").click();

        cy.findByTestId("login-page")
          .findByText("Your recovery codes")
          .should("be.visible");
        cy.url().should("contain", "/auth/login");
        cy.findByTestId("greeting-message").should("not.exist");

        cy.button("Done").click();
        cy.findByTestId("greeting-message").should("be.visible");
      });
    });

    describe("sso", () => {
      it(
        "requires a challenge when logging in via LDAP",
        { tags: "@external" },
        () => {
          cy.intercept("POST", "/api/session").as("login");
          let secret = "";

          H.setupLdap();
          requireMfa({ deadline: daysFromNow(-1) });

          cy.log(
            "LDAP provisions the user on first sign-in, then enrolls them",
          );
          signInWithLdap();
          cy.wait("@login").then(({ response }) => {
            secret = response?.body.secret;
          });
          cy.then(() => {
            cy.findByLabelText(
              "Enter the 6-digit code from the authenticator app",
            ).type(generateTotpCode(secret, Date.now() / 1000));
          });
          cy.button("Set up authentication").click();
          cy.button("Done").click();
          cy.findByTestId("greeting-message").should("be.visible");

          cy.log("Signing in again is challenged for the second factor");
          signInWithLdap();
          cy.findByTestId("login-page")
            .findByText("Enter the 6-digit code from your authenticator app.")
            .should("be.visible");
          // Enrollment consumed a time step, so take the next 30-second window
          cy.then(() => {
            cy.findByLabelText("Authenticator code").type(
              generateTotpCode(secret, Date.now() / 1000 + 30),
            );
          });
          cy.button("Verify").click();
          cy.findByTestId("greeting-message").should("be.visible");
        },
      );

      it(
        "does not require MFA challenge if logging in via SAML",
        { tags: "@external" },
        () => {
          H.setupSaml();

          requireMfa({ deadline: daysFromNow(-1) });

          cy.signOut();
          cy.visit("/auth/login");
          cy.button("Sign in with SSO").click();

          cy.log(
            "The IdP takes over — any password works, the domain is fixed",
          );
          cy.get("#username").type(SAML_USER.username);
          cy.get("#domain").select(SAML_USER.domain);
          cy.get("#password").type("anything");
          cy.get("button").click();

          cy.log("User is provisioned");
          cy.findByTestId("greeting-message").should("be.visible");
          cy.url().should("not.contain", "/auth/login");
          cy.findByTestId("login-page").should("not.exist");
        },
      );
    });
  });
});

function enrolledUsersTable() {
  return cy.findByTestId("mfa-enrolled-users-table");
}

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

type RequireMfaOptions = {
  deadline?: Date | null;
};

// sets MFA to required, will also set deadline to match current UX
function requireMfa({ deadline = null }: RequireMfaOptions = {}) {
  return cy.request("PUT", "/api/setting", {
    "mfa-enforcement": "required",
    "mfa-requirement-deadline": deadline?.toISOString() ?? null,
  });
}

function daysFromNow(days: number) {
  return dayjs().add(days, "day").startOf("day").toDate();
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

function signInWithPassword() {
  cy.signOut();
  cy.visit("/auth/login");
  cy.findByLabelText("Email address").type(normal.email);
  cy.findByLabelText("Password").type(normal.password);
  cy.button("Sign in").click();
}

function signInWithLdap() {
  cy.signOut();
  cy.visit("/auth/login");
  cy.findByLabelText("Username or email address").type(LDAP_USER.username);
  cy.findByLabelText("Password").type(LDAP_USER.password);
  cy.button("Sign in").click();
}

// Create a user to match what SAML server will respond with so they have
// have same permissions as a normal user
function createSamlUser() {
  // @ts-expect-error - this isn't typed yet
  return cy.createUserFromRawData({
    first_name: SAML_USER.username,
    last_name: SAML_USER.username,
    email: SAML_USER_EMAIL,
    user_group_memberships: normal.user_group_memberships,
  });
}

function getResetLink(html: string) {
  const [, anchor] = html.match(/<a (.*)>/) ?? [];
  const [, href] = String(anchor).match(/href="([^"]+)"/) ?? [];
  return String(href);
}

function generateTotpCode(secret: string, unixSeconds: number): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: unixSeconds * 1000 });
}
