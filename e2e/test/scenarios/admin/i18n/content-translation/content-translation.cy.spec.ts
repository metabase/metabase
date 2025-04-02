import path from "path";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { checkNotNull } from "metabase/lib/types";

const { PRODUCTS_ID } = SAMPLE_DATABASE;
const { H } = cy;

const sampleDictionary = `
Language,String,Translation
es,Accounts,Cuentas
es,Analytic Events,Eventos Analíticos
es,Customers,Clientes
es,Invoices,Facturas
es,Orders,Órdenes
es,People,Personas
es,Products,Productos
es,Reviews,Reseñas
es,Enormous Aluminum Shirt,Enorme Camisa de Aluminio
es,Vendor,Vendedor
es,Sample Database,Base de Datos de Ejemplo
es,Count of Products,Conteo de productos
es,Metric about Products,Métrica sobre productos
es,An interesting collection,Una colección interesante
fr,Accounts,Comptes
fr,Analytic Events,Événements Analytiques
fr,Customers,Clients
fr,Invoices,Factures
fr,Orders,Ordres
fr,People,Personnes
fr,Products,Produits
fr,Reviews,Avis
fr,Enormous Aluminum Shirt,Chemise en Aluminium Énorme
fr,Vendor,Vendeur
fr,Sample Database,Base de Données d'Exemple
fr,Count of Products,Nombre de produits
fr,Metric about Products,Métrique sur les produits
fr,An interesting collection,Une collection intéressante
`;

describe("scenarios > admin > localization > content translation", () => {
  before(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
  });

  describe("should be able to upload a translation dictionary and see the following string translated", () => {
    before(() => {
      cy.visit("/admin/settings/localization");

      cy.get("#content-translation-dictionary-upload-input").selectFile(
        {
          contents: Cypress.Buffer.from(sampleDictionary),
          fileName: "content_translations.csv",
          mimeType: "text/csv",
        },
        { force: true },
      );
      cy.findByText(/Dictionary uploaded/g).should("be.visible");

      cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, { locale: "es" });

      cy.log("Create a collection");
      H.createCollection({
        name: "An interesting collection",
        alias: "collectionId",
      });

      cy.get("@collectionId").then(collectionId => {
        cy.log("Create a model");
        H.createQuestion(
          {
            name: "Count of products",
            database: SAMPLE_DB_ID,
            type: "model",
            query: {
              "source-table": PRODUCTS_ID,
              aggregation: [["count"]],
            },
            collection_id: collectionId,
          },
          { wrapId: true, idAlias: "modelId" },
        );

        cy.log("Create a metric");
        H.createQuestion({
          name: "Metric about products",
          database: SAMPLE_DB_ID,
          type: "metric",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
          },
          collection_id: this.collectionId,
        });
      });
    });

    describe("context: query builder", () => {
      before(() => {
        cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

        cy.log("Can see translation of table name in Browse databases");
        cy.findByText("Productos").click();
      });

      it("a database name in the question breadcrumb header", () => {
        cy.findByTestId("head-crumbs-container")
          .findByText("Base de Datos de Ejemplo")
          .should("be.visible");
      });

      it("a table name in the question breadcrumb header", () => {
        cy.findByTestId("head-crumbs-container")
          .findByText("Productos")
          .should("be.visible");
      });

      it("cell data", () => {
        cy.findAllByTestId("cell-data").should(
          "contain",
          "Enorme Camisa de Aluminio",
        );
      });
    });

    describe("Context: Browse models", () => {
      before(() => {
        cy.visit("/browse/models");
      });
      it("model name", () => {
        cy.findByText("Conteo de productos").should("be.visible");
      });
      it("collection name", () => {
        cy.findByText("Una colección interesante").should("be.visible");
      });
    });

    describe("Context: Browse metrics", () => {
      before(() => {
        cy.visit("/browse/metrics");
      });
      it("metric name", () => {
        cy.findByText("Métrica sobre productos").should("be.visible");
      });
      it("collection name", () => {
        cy.findByText("Una colección interesante").should("be.visible");
      });
    });

    describe("Context: Home page", () => {
      it.only("home page recents section", () => {
        cy.get("@modelId").then(theModelId => {
          H.visitModel(checkNotNull(theModelId as unknown as number));
          H.visitHomepage({ homeText: "Inicio" });
          cy.findByTestId("home-page")
            .findByText("Conteo de productos")
            .should("be.visible");
        });
      });
    });
  });

  describe("should be able to download a translation dictionary", () => {
    let fileContents = "";
    before(() => {
      cy.visit("/admin/settings/localization");
      cy.button(/Download translation dictionary/g).click();
      H.modal().within(() => {
        cy.findByText(/Download translation dictionary/g);
        cy.findByText("French").click();
        cy.findByText("Spanish").click();
        cy.button("Download").click();
      });
      const downloadsFolder = Cypress.config("downloadsFolder");
      cy.readFile(
        path.join(downloadsFolder, "content-translations-es,fr.csv"),
      ).then(contents => {
        fileContents = contents;
      });
    });

    it("with raw table names", () => {
      expect(fileContents).to.include(",Products,");
    });

    it("with raw column names", () => {
      expect(fileContents).to.include(",Vendor,");
      //
    });

    it("with raw database names", () => {
      expect(fileContents).to.include(",Sample Database,");
      // TODO: Add more database names
      expect(fileContents).to.include(",Sample Database,");
    });

    it("with raw strings from results", () => {
      expect(fileContents).to.include(",Enormous Aluminum Shirt,");
    });

    it("with field values", () => {
      // TODO: I'm not sure what the difference is between raw strings and field values
      // field values
    });
  });

  // TODO: Test that uploaded translations appear when re-downloading
});
