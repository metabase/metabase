import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockField,
  createMockParameter,
} from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

import { getCardUiParametersFromParamFields } from "./cards";

describe("parameters/utils/cards", () => {
  describe("getCardUiParametersFromParamFields", () => {
    const dateParameter = createMockParameter({
      id: "param-1",
      name: "Created At",
      slug: "created_at",
      type: "date/single",
      target: ["dimension", ["template-tag", "created_at"]],
    });
    const variableParameter = createMockParameter({
      id: "param-2",
      name: "Limit",
      slug: "limit",
      type: "number/=",
      target: ["variable", ["template-tag", "limit"]],
    });

    it("should get parameter fields from param_fields via metadata", () => {
      const metadata = createMockMetadata({
        fields: [createMockField({ id: 1 }), createMockField({ id: 2 })],
      });
      const card = createMockCard({
        parameters: [dateParameter, variableParameter],
        param_fields: {
          [dateParameter.id]: [
            createMockField({ id: 1 }),
            createMockField({ id: 2 }),
            createMockField({ id: 1 }),
          ],
        },
      });

      const [dateUiParameter, variableUiParameter] =
        getCardUiParametersFromParamFields(card, metadata);

      expect(dateUiParameter).toMatchObject({
        id: dateParameter.id,
        fields: [metadata.field(1), metadata.field(2)],
        hasVariableTemplateTagTarget: false,
      });
      expect(variableUiParameter).toMatchObject({
        id: variableParameter.id,
        hasVariableTemplateTagTarget: true,
      });
      expect(variableUiParameter).not.toHaveProperty("fields");
    });

    it("should ignore fields missing from metadata", () => {
      const metadata = createMockMetadata({ fields: [] });
      const card = createMockCard({
        parameters: [dateParameter],
        param_fields: {
          [dateParameter.id]: [createMockField({ id: 1 })],
        },
      });

      const [dateUiParameter] = getCardUiParametersFromParamFields(
        card,
        metadata,
      );

      expect(dateUiParameter).toMatchObject({
        id: dateParameter.id,
        hasVariableTemplateTagTarget: false,
      });
      expect(dateUiParameter).not.toHaveProperty("fields");
    });

    it("should populate parameter values", () => {
      const metadata = createMockMetadata({ fields: [] });
      const card = createMockCard({
        parameters: [dateParameter],
        param_fields: {},
      });

      const [dateUiParameter] = getCardUiParametersFromParamFields(
        card,
        metadata,
        { [dateParameter.id]: "2026-01-01" },
      );

      expect(dateUiParameter).toMatchObject({
        id: dateParameter.id,
        value: "2026-01-01",
      });
    });

    it("should fall back to template tag parameters when the card has none saved", () => {
      const card = createMockCard({
        parameters: [],
        param_fields: { "tag-id": [createMockField({ id: ORDERS.QUANTITY })] },
        dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
          query: "SELECT * FROM ORDERS WHERE {{quantity}}",
          templateTags: {
            quantity: {
              id: "tag-id",
              type: "dimension",
              dimension: ORDERS.QUANTITY,
              "widget-type": "number/=",
            },
          },
        }),
      });

      const [quantityUiParameter] = getCardUiParametersFromParamFields(
        card,
        SAMPLE_METADATA,
      );

      expect(quantityUiParameter).toMatchObject({
        id: "tag-id",
        fields: [SAMPLE_METADATA.field(ORDERS.QUANTITY)],
        hasVariableTemplateTagTarget: false,
      });
    });

    it("should handle cards without parameters or param_fields", () => {
      const metadata = createMockMetadata({});
      const card = createMockCard({ parameters: undefined });

      expect(getCardUiParametersFromParamFields(card, metadata)).toEqual([]);
    });
  });
});
