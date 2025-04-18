import type {
  DictionaryArrayRow,
  DictionaryResponse,
} from "metabase/i18n/types";

import {
  nonAsciiTranslationsOfColumnNames,
  translationsOfColumnNames,
} from "./constants";
import { getCSV } from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

describe("scenarios > admin > localization > content translation", () => {
  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("admin settings configuration form is not present", () => {
      cy.visit("/admin/settings/localization");
      cy.findByTestId("content-localization-setting").should("not.exist");
      cy.findByTestId("admin-layout-content")
        .findByText(/translation dictionary/i)
        .should("not.exist");
    });
  });

  describe("ee", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    describe("The translation upload form", () => {
      [
        {
          csvName: "CSV upload with ASCII characters",
          rows: translationsOfColumnNames,
        },
        {
          csvName: "CSV upload with non-ASCII characters",
          rows: nonAsciiTranslationsOfColumnNames,
        },
      ].forEach(({ csvName, rows }) => {
        it(`accepts a ${csvName}`, () => {
          cy.visit("/admin/settings/localization");
          cy.findByTestId("content-localization-setting").findByText(
            /Upload translation dictionary/,
          );
          cy.get("#content-translation-dictionary-upload-input").selectFile(
            {
              contents: Cypress.Buffer.from(getCSV(rows)),
              fileName: "file.csv",
              mimeType: "text/csv",
            },
            { force: true },
          );
          cy.findByTestId("content-localization-setting").findByText(
            "Dictionary uploaded",
          );

          cy.signInAsNormalUser();

          cy.request<DictionaryResponse>(
            "GET",
            "/api/content-translation/dictionary",
          ).then((interception) => {
            const { data } = interception.body;
            const msgstrs = data.map((row) => row.msgstr);
            expect(msgstrs.toSorted()).to.deep.equal(
              rows.map((row) => row.msgstr).toSorted(),
            );
          });
        });
      });

      [
        { fileName: "file.html", mimeType: "text/html" },
        { fileName: "file.csv", mimeType: "text/html" },
        { fileName: "file.html", mimeType: "text/csv" },
      ].forEach(({ fileName, mimeType }) => {
        it(`rejects an uploaded ${fileName} with mime-type ${mimeType}`, () => {
          cy.visit("/admin/settings/localization");
          cy.findByTestId("content-localization-setting").findByText(
            /Upload translation dictionary/,
          );
          cy.get("#content-translation-dictionary-upload-input").selectFile(
            {
              contents: Cypress.Buffer.from("<html><body>:-)</body></html>"),
              fileName,
              mimeType,
            },
            { force: true },
          );
          cy.findByTestId("content-localization-setting").findByText(
            /The file could not be uploaded./,
          );
        });
      });

      it("rejects csv with invalid locale in one row", () => {
        cy.visit("/admin/settings/localization");

        cy.findByTestId("content-localization-setting").findByText(
          /Upload translation dictionary/,
        );

        const validData = getCSV(translationsOfColumnNames);
        const invalidData = validData.replace(/de,/, "ze,");
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(invalidData),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );
        cy.log("The error is in row 2 (the first row is the header)");
        cy.findByTestId("content-localization-setting").findByText(
          /The file could not be uploaded due to a problem in row 2: Invalid locale: ze/,
        );
      });

      (["msgid", "msgstr"] as const).forEach((column) => {
        it(`rejects a CSV containing a row with a ${column} that is too long`, () => {
          cy.visit("/admin/settings/localization");

          cy.findByTestId("content-localization-setting").findByText(
            /Upload translation dictionary/,
          );

          const maxLength = 255;
          const validData = getCSV(translationsOfColumnNames);
          const tooLong = "a".repeat(maxLength + 1);
          const invalidRow: DictionaryArrayRow = {
            ...translationsOfColumnNames[0],
            [column]: tooLong,
          };
          const invalidData =
            validData +
            `\n${invalidRow.locale},${invalidRow.msgid},${invalidRow.msgstr}`;

          cy.get("#content-translation-dictionary-upload-input").selectFile(
            {
              contents: Cypress.Buffer.from(invalidData),
              fileName: "file.csv",
              mimeType: "text/csv",
            },
            { force: true },
          );
          cy.findByTestId("content-localization-setting").findByText(
            new RegExp(
              `The file could not be uploaded due to a problem in row ${translationsOfColumnNames.length + 2}.*longer.*maximum allowed length`,
              "i",
            ),
          );
        });
      });
    });
  });
});
