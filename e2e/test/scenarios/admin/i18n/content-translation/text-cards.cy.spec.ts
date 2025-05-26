import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";
import type { DictionaryArray } from "metabase/i18n/types";

import { uploadTranslationDictionary } from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

describe("scenarios > dashboard > content translation of text cards and headings", () => {
  describe("ee", () => {
    const textCardTranslations: DictionaryArray = [
      { locale: "de", msgid: "Sample Text", msgstr: "Beispieltext" },
      { locale: "de", msgid: "Sample Heading", msgstr: "Beispielüberschrift" },
      {
        locale: "de",
        msgid: "Category is {{category}}",
        msgstr: "Kategorie ist {{category}}",
      },
    ];
    before(() => {
      H.restore();
      cy.intercept("POST", "api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );
      cy.signInAsAdmin();
      H.setTokenFeatures("all");

      cy.log("Upload sample translation dictionary");
      uploadTranslationDictionary(textCardTranslations);

      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale: "de" });
      H.snapshot("translations-uploaded");
    });

    beforeEach(() => {
      H.restore("translations-uploaded" as any);
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

        H.editDashboard();
        H.getDashboardCard(0).click();
        cy.get("input").should("have.value", "Sample Heading");
      });
    });
  });
});
