import dayjs from "dayjs";

const { H } = cy;

describe("scenarios > admin > tools > help", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should link `Get help` to help", () => {
    cy.visit("/admin/tools/help");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Get help")
      .parents("a")
      .should("have.prop", "href")
      .and(
        "match",
        /^https:\/\/www\.metabase\.com\/help\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=v(?:(?!diag=).)+$/,
      );
  });
});

describe("scenarios > admin > tools > help (EE)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should link `Get Help` to help-premium", () => {
    cy.visit("/admin/tools/help");

    cy.findByTestId("admin-layout-content")
      .findByText("Get help")
      .parents("a")
      .should("have.prop", "href")
      .and(
        "match",
        /^https:\/\/www\.metabase\.com\/help-premium\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=v.+&diag=%7B.+%7D$/,
      );
  });
});

describe("scenarios > admin > tools > help > helping hand", () => {
  const executeCreateGrantAccessFlow = (
    durationOption?: "96 hours" | "48 hours" | "24 hours",
    ticket?: string,
    notes?: string,
  ) => {
    cy.findByTestId("access-grant-list-table").should("not.exist");
    cy.button("Request a helping hand").should("be.enabled");
    cy.button("Request a helping hand").click();

    // Clicking the button should open the modal
    cy.findByTestId("grant-access-modal").should("be.visible");
    cy.findByTestId("grant-access-modal").within(() => {
      cy.findByRole("heading", { name: "Grant Access?" }).should("be.visible");

      if (durationOption) {
        cy.findByLabelText(/Access duration/).click();
        cy.document()
          .findByRole("listbox")
          .findByText(new RegExp(durationOption, "g"))
          .click();
      }

      if (ticket) {
        cy.findByLabelText("Ticket").type(ticket);
      }
      if (notes) {
        cy.findByLabelText("Notes").type(notes);
      }

      cy.button("Grant access").click();
    });

    H.undoToast()
      .findByText("Access grant created successfully")
      .should("be.visible");
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.mockSessionPropertiesTokenFeatures({ "support-users": true });
  });

  it("should only display the `Helping hand` section for cloud customers", () => {
    cy.visit("/admin/tools/help");
    cy.findByRole("heading", { name: "Helping hand" }).should("not.exist");

    H.activateToken("pro-self-hosted");
    cy.reload();
    cy.findByRole("heading", { name: "Helping hand" }).should("not.exist");

    H.activateToken("starter");
    cy.reload();
    cy.findByRole("heading", { name: "Helping hand" }).should("be.visible");

    H.activateToken("pro-cloud");
    cy.reload();
    cy.findByRole("heading", { name: "Helping hand" }).should("be.visible");
  });

  it("should allow creating a new access grant", () => {
    H.activateToken("pro-cloud");
    cy.visit("/admin/tools/help");

    cy.findByTestId("access-grant-list-table").should("not.exist");

    executeCreateGrantAccessFlow();

    cy.findByTestId("access-grant-list-table").should("be.visible");
    cy.findByTestId("access-grant-list-table").within(() => {
      cy.get("tbody").findAllByRole("row").should("have.length", 1);
    });
  });

  it("allow creating an access grant with a ticket number and custom notes", () => {
    H.activateToken("pro-cloud");
    cy.visit("/admin/tools/help");

    executeCreateGrantAccessFlow("48 hours", "TICKET-999", "Custom notes");

    cy.findByTestId("access-grant-list-table").within(() => {
      cy.findByRole("cell", {
        name: new RegExp(dayjs().format("MMM D, YYYY"), "g"),
      }).should("be.visible");
      cy.findByRole("cell", { name: /TICKET-999/ }).should("be.visible");
      cy.findByRole("cell", { name: /Custom notes/ }).should("be.visible");
      cy.findByText(/48 hours left/).should("be.visible");
    });
  });

  it("should disallow more than one active access grant", () => {
    H.activateToken("pro-cloud");
    cy.visit("/admin/tools/help");

    executeCreateGrantAccessFlow();

    cy.button("Request a helping hand").should("be.disabled");
    cy.button("Request a helping hand")
      .siblings()
      .findByText("You can only have one active request at a time")
      .should("be.visible");
  });

  it("can revoke an access grant", () => {
    H.activateToken("pro-cloud");
    cy.visit("/admin/tools/help");

    executeCreateGrantAccessFlow();
    cy.button("Request a helping hand").should("be.disabled");

    H.undoToast().icon("close").click();

    cy.findByTestId("access-grant-list-table")
      .button("Revoke access grant")
      .click();
    H.modal()
      .findByRole("heading", { name: "Revoke access grant?" })
      .should("be.visible");
    H.modal().button("Revoke").click();
    H.undoToast()
      .findByText("Access grant revoked successfully")
      .should("be.visible");

    cy.button("Request a helping hand").should("be.enabled");
  });
});
