import { DictionaryArray } from "metabase/i18n/types";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { uploadTranslationDictionary } from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

// NOTE: Claude wrote most of this. I still need to check that it works

describe("scenarios > dashboard > content translation of text cards and headings", () => {
  const textCardTranslations: DictionaryArray = [
    { locale: "de", msgid: "Sample Text", msgstr: "Beispieltext" },
    { locale: "de", msgid: "Sample Heading", msgstr: "Beispielüberschrift" },
    {
      locale: "de",
      msgid: "Category is {{category}}",
      msgstr: "Kategorie ist {{category}}",
    },
  ];

  beforeEach(() => {
    cy.intercept("POST", "api/ee/content-translation/upload-dictionary").as(
      "uploadDictionary",
    );
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.log("Upload translation dictionary with our test translations");
    uploadTranslationDictionary(textCardTranslations);

    cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale: "de" });
  });

  it("should translate text in dashboard text cards", () => {
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);

      H.editDashboard();
      H.addTextBoxWhileEditing("Sample Text", {
        parseSpecialCharSequences: false,
      });

      H.saveDashboard();

      H.getDashboardCard(0).findByText("Beispieltext").should("be.visible");

      H.editDashboard();
      H.getDashboardCard(0).click();
      cy.get("textarea").should("have.value", "Category");
    });
  });

  it("should translate text in dashboard heading cards", () => {
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);

      H.editDashboard();
      H.addHeadingWhileEditing("Sample Heading", {
        parseSpecialCharSequences: false,
      });

      H.saveDashboard();

      H.getDashboardCard(0)
        .findByText("Beispielüberschrift")
        .should("be.visible");

      // Verify the original text is shown when editing
      H.editDashboard();
      H.getDashboardCard(0).click();
      cy.get("input").should("have.value", "Sample Heading");

      // Cancel editing without saving changes
      cy.findByText("Cancel").click();
    });
  });

  it("should preserve parameter substitutions when translating text cards", () => {
    // Create a new dashboard with a parameter
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
      H.editDashboard();

      // Add a text card with a category parameter
      H.addTextBoxWhileEditing("Category is {{category}}", {
        parseSpecialCharSequences: false,
      });

      // Add a heading with a parameter
      H.addHeadingWhileEditing("Category is {{category}}", {
        parseSpecialCharSequences: false,
      });

      // Set up a filter
      H.setFilter("Text", "Is");

      // Connect filter to text cards
      H.getDashboardCard(0).findByText("Select…").click();
      H.popover().findByText("category").click();

      H.getDashboardCard(1).findByText("Select…").click();
      H.popover().findByText("category").click();

      // Save the dashboard
      H.saveDashboard();

      // Add a filter value
      H.filterWidget().click();
      H.dashboardParametersPopover().within(() =>
        H.fieldValuesCombobox().type("Gadget"),
      );
      cy.button("Add filter").click();

      // Verify the translation preserves the parameter
      H.getDashboardCard(0)
        .findByText("Kategorie ist Gadget")
        .should("be.visible");
      H.getDashboardCard(1)
        .findByText("Kategorie ist Gadget")
        .should("be.visible");

      // When we edit, the original text is shown
      H.editDashboard();
      H.getDashboardCard(0).click();
      cy.get("textarea").should("have.value", "Category is {{category}}");
      H.getDashboardCard(1).click();
      cy.get("input").should("have.value", "Category is {{category}}");
    });
  });
});
