import {
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { DictionaryArray } from "metabase/i18n/types";

import { uploadTranslationDictionary } from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

describe("scenarios > content translation > dashboard tab names", () => {
  const textCardTranslations: DictionaryArray = [
    { locale: "de", msgid: "Tab 1", msgstr: "Reiter 1" },
  ];

  beforeEach(() => {
    cy.intercept("POST", "api/ee/content-translation/upload-dictionary").as(
      "uploadDictionary",
    );
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
    uploadTranslationDictionary(textCardTranslations);
    cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale: "de" });
  });

  it("should translate text in dashboard tab names", () => {
    H.visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
    });
    cy.findByRole("tab", { name: "Reiter 1" });
  });
});
