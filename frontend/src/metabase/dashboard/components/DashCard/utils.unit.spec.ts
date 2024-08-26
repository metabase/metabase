import { createMockMetadata } from "__support__/metadata";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import Question from "metabase-lib/v1/Question";
import type {
  ParameterTarget,
  ParameterTextTarget,
  ParameterVariableTarget,
  QuestionDashboardCard,
} from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockStructuredDatasetQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getMappingOptionByTarget } from "./utils";

describe("dashcard utils", () => {
  describe("getMappingOptionByTarget", () => {
    describe("virtual dashcard", () => {
      it("should find mapping option", () => {
        const headingCard = createMockHeadingDashboardCard();
        const mappingOption: ParameterMappingOption = {
          name: "param",
          icon: "string",
          isForeign: false,
          target: ["text-tag", "param"],
        };
        const target: ParameterTextTarget = ["text-tag", "param"];

        expect(
          getMappingOptionByTarget([mappingOption], headingCard, target),
        ).toBe(mappingOption);
      });

      it("should return undefined if option is not found", () => {
        const headingCard = createMockHeadingDashboardCard();
        const mappingOption: ParameterMappingOption = {
          name: "param",
          icon: "string",
          isForeign: false,
          target: ["text-tag", "param"],
        };
        const target: ParameterTextTarget = ["text-tag", "param2"];

        expect(
          getMappingOptionByTarget([mappingOption], headingCard, target),
        ).toBe(undefined);
      });
    });

    describe("action dashcard", () => {
      it("should return nothing as action has it's own settings", () => {
        const actionDashcard = createMockActionDashboardCard();
        const mappingOptions: ParameterMappingOption[] = [
          {
            icon: "variable",
            isForeign: false,
            name: "Param1",
            id: "a8ab6fee-7974-4f51-833c-35177b446467",
            type: "string/=",
            target: ["variable", ["template-tag", "param1"]],
            slug: "param1",
            hasVariableTemplateTagTarget: true,
          },
        ];
        const target: ParameterVariableTarget = [
          "variable",
          ["template-tag", "param1"],
        ];

        expect(
          getMappingOptionByTarget(mappingOptions, actionDashcard, target),
        ).toBe(undefined);
      });
    });
    describe("native dashcard", () => {
      it("should find mapping option", () => {
        const card = createMockCard({
          dataset_query: createMockNativeDatasetQuery({
            native: createMockNativeQuery({
              query: "SELECT * FROM ACCOUNTS WHERE source = {{ source }}",
              "template-tags": {
                source: createMockTemplateTag({ name: "source" }),
              },
            }),
          }),
        });
        const dashcard = createMockDashboardCard({ card });

        const mappingOption: ParameterMappingOption = {
          name: "Source",
          icon: "string",
          isForeign: false,
          target: ["variable", ["template-tag", "source"]],
        };
        const target: ParameterTarget = [
          "variable",
          ["template-tag", "source"],
        ];

        expect(
          getMappingOptionByTarget([mappingOption], dashcard, target),
        ).toBe(mappingOption);
      });
      it("should return undefined if option is not found", () => {
        const card = createMockCard({
          dataset_query: createMockNativeDatasetQuery({
            native: createMockNativeQuery({
              query: "SELECT * FROM ACCOUNTS WHERE source = {{ source }}",
              "template-tags": {
                source: createMockTemplateTag({ name: "source" }),
              },
            }),
          }),
        });
        const dashcard = createMockDashboardCard({ card });

        const mappingOption: ParameterMappingOption = {
          name: "Source",
          icon: "string",
          isForeign: false,
          target: ["variable", ["template-tag", "source"]],
        };
        const target: ParameterTarget = [
          "variable",
          ["template-tag", "source1"],
        ];

        expect(
          getMappingOptionByTarget([mappingOption], dashcard, target),
        ).toBe(undefined);
      });
    });
    describe("structured dashcard", () => {
      let question: Question;
      let dashcard: QuestionDashboardCard;

      beforeEach(() => {
        const card = createMockCard({
          dataset_query: createMockStructuredDatasetQuery({
            query: {
              "source-table": 2,
            },
          }),
        });
        const database = createSampleDatabase();
        const metadata = createMockMetadata({
          questions: [card],
          databases: [database],
        });

        question = new Question(card, metadata);
        dashcard = createMockDashboardCard({ card });
      });
      it("should find mapping option", () => {
        const mappingOption: ParameterMappingOption = {
          sectionName: "User",
          name: "Name",
          icon: "string",
          target: [
            "dimension",
            [
              "field",
              1,
              {
                "base-type": "type/Text",
              },
            ],
          ],
          isForeign: true,
        };

        const target: ParameterTarget = [
          "dimension",
          [
            "field",
            1,
            {
              "base-type": "type/Text",
            },
          ],
        ];

        expect(
          getMappingOptionByTarget([mappingOption], dashcard, target, question),
        ).toBe(mappingOption);
      });
      it("should return undefined if option is not found", () => {
        const card = createMockCard({
          dataset_query: createMockStructuredDatasetQuery({
            query: {
              "source-table": 2,
            },
          }),
        });
        const database = createSampleDatabase();
        const metadata = createMockMetadata({
          questions: [card],
          databases: [database],
        });

        const question = new Question(card, metadata);
        const dashcard = createMockDashboardCard({ card });

        const mappingOption: ParameterMappingOption = {
          sectionName: "User",
          name: "Name",
          icon: "string",
          target: [
            "dimension",
            [
              "field",
              1,
              {
                "base-type": "type/Text",
              },
            ],
          ],
          isForeign: true,
        };

        const target: ParameterTarget = [
          "dimension",
          [
            "field",
            2,
            {
              "base-type": "type/Text",
            },
          ],
        ];

        expect(
          getMappingOptionByTarget([mappingOption], dashcard, target, question),
        ).toBe(undefined);
      });
    });
  });
});
