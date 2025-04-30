import type { BaseEmbedTestPageOptions } from "e2e/support/helpers/e2e-embedding-iframe-sdk-helpers";

const { H } = cy;

type TestCase = {
  name: string;
  params: Partial<BaseEmbedTestPageOptions>;
  expectedError: string;
};

describe("scenarios > embedding > sdk iframe embedding > iframe validation", () => {
  const testCases: TestCase[] = [
    {
      name: "throws when target element is not found",
      params: {
        target: "#not-existent-target",
      },
      expectedError:
        '[metabase.embed] cannot find embed container "#not-existent-target"',
    },
    {
      name: "throws when target element is undefined",
      params: {
        target: undefined,
      },
      expectedError: '[metabase.embed] cannot find embed container "undefined"',
    },
    {
      name: "throws when api key is not provided",
      params: {
        apiKey: undefined,
      },
      expectedError:
        "[metabase.embed] api key and instance url must be provided",
    },
    {
      name: "throws when instance url is not provided",
      params: {
        apiKey: "foobar",
        instanceUrl: undefined,
      },
      expectedError:
        "[metabase.embed] api key and instance url must be provided",
    },
    {
      name: "throws when both question id and dashboard id are provided",
      params: {
        questionId: 10,
        dashboardId: 10,
      },
      expectedError:
        "[metabase.embed] can't use both dashboardId and questionId at the same time",
    },
    {
      name: "throws when question id is provided in the exploration template",
      params: {
        template: "exploration",
        questionId: 10,
      },
      expectedError:
        "[metabase.embed] the exploration template can't be used with dashboardId or questionId",
    },
    {
      name: "throws when dashboard id is provided in the exploration template",
      params: {
        template: "exploration",
        dashboardId: 10,
      },
      expectedError:
        "[metabase.embed] the exploration template can't be used with dashboardId or questionId",
    },
  ];

  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  testCases.forEach(({ name, params, expectedError }) => {
    it(name, () => {
      H.loadSdkIframeEmbedTestPage({
        ...params,
        expectErrors: true,
      });

      cy.get("@consoleError").should("be.calledWith", expectedError);
    });
  });
});
