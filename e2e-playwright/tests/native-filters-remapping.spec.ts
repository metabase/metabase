/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/native-filters-remapping.cy.spec.ts
 *
 * Porting notes:
 * - createMockParameter only fills defaults the spec overrides anyway, so the
 *   parameters are written out inline (no metabase-types import needed).
 * - H.createNativeQuestion with parameters + enable_embedding maps to
 *   createNativeQuestionWithParameters (support/native-filters-extras.ts):
 *   parameters ride the POST, embedding fields need the follow-up PUT.
 * - cy.findByPlaceholderText(...).type("1,") on the ID token fields →
 *   pressSequentially (token commit depends on real keystrokes).
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  createNativeQuestionWithParameters,
  filterWidgetByName,
} from "../support/native-filters-extras";
import { visitEmbeddedPage } from "../support/question-saved";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitPublicQuestion } from "../support/sharing";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS, PRODUCTS, PEOPLE } = SAMPLE_DATABASE;

test.describe("scenarios > native > filters > remapping", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await addInternalRemapping(mb.api);
    await addExternalRemapping(mb.api);
  });

  test("should remap dashboard parameter values", async ({ page, mb }) => {
    const questionId = await createQuestion(mb.api);

    await visitQuestion(page, questionId);
    await testWidgetsRemapping(page);

    await visitPublicQuestion(page, mb, questionId);
    await testWidgetsRemapping(page);

    await visitEmbeddedPage(page, mb, {
      resource: { question: questionId },
      params: {},
    });
    await testWidgetsRemapping(page);
  });
});

async function addInternalRemapping(api: MetabaseApi) {
  await api.post(`/api/field/${ORDERS.QUANTITY}/dimension`, {
    name: "Quantity",
    type: "internal",
    human_readable_field_id: null,
  });

  const response = await api.get(`/api/field/${ORDERS.QUANTITY}/values`);
  const body = (await response.json()) as { values: [number][] };
  await api.post(`/api/field/${ORDERS.QUANTITY}/values`, {
    values: body.values.map(([value]) => [value, `N${value}`]),
  });
}

async function addExternalRemapping(api: MetabaseApi) {
  await api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

async function createQuestion(api: MetabaseApi): Promise<number> {
  const { id } = await createNativeQuestionWithParameters(api, {
    name: "Orders native question",
    native: {
      query:
        "SELECT * " +
        "FROM ORDERS " +
        "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
        "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
      "template-tags": {
        quantity: {
          id: "quantity",
          name: "quantity",
          "display-name": "Internal",
          type: "dimension",
          "widget-type": "number/=",
          dimension: ["field", ORDERS.QUANTITY, null],
        },
        product_id_fk: {
          id: "product_id_fk",
          name: "product_id_fk",
          "display-name": "FK",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
        },
        user_id_pk: {
          id: "user_id_pk",
          name: "user_id_pk",
          "display-name": "PK->Name",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", PEOPLE.ID, null],
        },
      },
    },
    parameters: [
      {
        id: "quantity",
        name: "Internal",
        slug: "quantity",
        type: "number/=",
        target: ["dimension", ["template-tag", "quantity"]],
      },
      {
        id: "product_id_fk",
        name: "FK",
        slug: "product_id_fk",
        type: "id",
        target: ["dimension", ["template-tag", "product_id_fk"]],
      },
      {
        id: "user_id_pk",
        name: "PK->Name",
        slug: "user_id_pk",
        type: "id",
        target: ["dimension", ["template-tag", "user_id_pk"]],
      },
    ],
    enable_embedding: true,
    embedding_params: {
      quantity: "enabled",
      product_id_fk: "enabled",
      user_id_pk: "enabled",
    },
  });
  return id;
}

async function testWidgetsRemapping(page: Page) {
  // internal remapping
  await filterWidgetByName(page, "Internal").click();
  const internalDropdown = popover(page);
  await internalDropdown.getByText("N5", { exact: true }).click();
  await internalDropdown
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await expect(filterWidgetByName(page, "Internal")).toContainText("N5");

  // FK remapping
  await filterWidgetByName(page, "FK").click();
  const fkDropdown = popover(page);
  await fkDropdown
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("1,");
  await expect(
    fkDropdown.getByText("Rustic Paper Wallet", { exact: true }),
  ).toBeVisible();
  await fkDropdown
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await expect(filterWidgetByName(page, "FK")).toContainText(
    "Rustic Paper Wallet",
  );

  // PK->Name remapping
  await filterWidgetByName(page, "PK->Name").click();
  const pkDropdown = popover(page);
  await pkDropdown
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("1,");
  await expect(
    pkDropdown.getByText("Hudson Borer", { exact: true }),
  ).toBeVisible();
  await pkDropdown
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await expect(filterWidgetByName(page, "PK->Name")).toContainText(
    "Hudson Borer",
  );
}
