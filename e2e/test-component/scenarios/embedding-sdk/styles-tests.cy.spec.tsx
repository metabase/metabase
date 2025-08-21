import {
  CreateDashboardModal,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  MetabaseProvider,
  StaticQuestion,
  defineMetabaseTheme,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { ConcreteFieldReference, Parameter } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DATE_FILTER: Parameter = {
  id: "2",
  name: "Date filter",
  slug: "filter-date",
  type: "date/all-options",
};
const CREATED_AT_FIELD_REF: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime" },
];

describe("scenarios > embedding-sdk > styles", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  describe("common", () => {
    it('PublicComponentStylesWrapper should have the `dir="ltr"` attribute (#54082)', () => {
      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      getSdkRoot().get(".mb-wrapper").should("have.attr", "dir", "ltr");
    });
  });

  describe("theming", () => {
    const theme = defineMetabaseTheme({
      colors: {
        brand: "#FF0000",
      },
    });

    it("should use the brand color from the theme", () => {
      cy.mount(
        <MetabaseProvider
          authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
          theme={theme}
        >
          <InteractiveQuestion questionId="new" />
        </MetabaseProvider>,
      );

      getSdkRoot()
        .findByText("Pick your starting data")
        .invoke("css", "color")
        .should("equal", "rgb(255, 0, 0)");
    });

    it("should use the brand color from the app settings as fallback if they're present", () => {
      cy.signInAsAdmin();
      H.updateSetting(
        // @ts-expect-error -- that function doesn't understand enterprise settings _yet_
        "application-colors",
        {
          brand: "#00FF00",
        },
      );
      cy.signOut();

      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId="new" />
        </MetabaseProvider>,
      );

      getSdkRoot()
        .findByText("Pick your starting data")
        .invoke("css", "color")
        .should("equal", "rgb(0, 255, 0)");
    });

    it("but should prioritize the theme colors over the app settings", () => {
      cy.signInAsAdmin();
      H.updateSetting(
        // @ts-expect-error -- that function doesn't understand enterprise settings _yet_
        "application-colors",
        {
          brand: "#00FF00",
        },
      );
      cy.signOut();

      cy.mount(
        <MetabaseProvider
          authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
          theme={theme}
        >
          <InteractiveQuestion questionId="new" />
        </MetabaseProvider>,
      );

      getSdkRoot()
        .findByText("Pick your starting data")
        .invoke("css", "color")
        .should("equal", "rgb(255, 0, 0)");
    });
  });

  describe("style leaking", () => {
    it("[success scenario] should use the default fonts outside of our components, and Lato on our components", () => {
      wrapBrowserDefaultFont();

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      cy.get("@defaultBrowserFontFamily").then((defaultBrowserFontFamily) => {
        cy.findByText("This is outside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );
        cy.findByText("This is inside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );
        cy.findByText("Product ID").should("have.css", "font-family", "Lato");
      });
    });

    it("[error scenario] should use the default fonts outside of our components, and Lato on our components", () => {
      wrapBrowserDefaultFont();

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider
            authConfig={{
              apiKey: "TEST",
              metabaseInstanceUrl: "http://fake-host:1234",
            }}
          >
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser");

      cy.get("@defaultBrowserFontFamily").then((defaultBrowserFontFamily) => {
        cy.findByText("This is outside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );

        cy.findByText("This is inside of the provider").should(
          "have.css",
          "font-family",
          defaultBrowserFontFamily,
        );

        cy.findByText(/Failed to fetch the user/).should(
          "have.css",
          "font-family",
          "Lato",
        );
      });
    });
  });

  describe("fontFamily", () => {
    it("should use the font from the theme if set", () => {
      cy.mount(
        <MetabaseProvider
          authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
          theme={{ fontFamily: "Impact" }}
        >
          <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      getSdkRoot()
        .findByText("Product ID")
        .should("have.css", "font-family", "Impact");
    });

    it("should fallback to the font from the instance if no fontFamily is set on the theme", () => {
      cy.signInAsAdmin();
      H.updateSetting("application-font", "Roboto Mono");
      cy.signOut();

      cy.intercept("GET", "/api/user/current").as("getUser");

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      getSdkRoot()
        .findByText("Product ID")
        .should("have.css", "font-family", '"Roboto Mono"');
    });

    it("should work with 'Custom' fontFamily, using the font files linked in the instance", () => {
      cy.signInAsAdmin();

      const fontUrl =
        Cypress.config().baseUrl +
        "/app/fonts/Open_Sans/OpenSans-Regular.woff2";
      // setting `application-font-files` will make getFont return "Custom"
      H.updateSetting("application-font-files", [
        {
          src: fontUrl,
          fontWeight: 400,
          fontFormat: "woff2",
        },
      ]);

      cy.signOut();

      cy.intercept("GET", fontUrl).as("fontFile");

      cy.intercept("GET", "/api/user/current").as("getUser");

      cy.mount(
        <div>
          <h1>No styles applied anywhere, should use browser default</h1>
          <div style={{ border: "1px solid black" }}>
            <h1>This is outside of the provider</h1>
          </div>

          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <div style={{ border: "1px solid black" }}>
              <h1>This is inside of the provider</h1>
            </div>

            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      cy.wait("@getUser").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      // this test only tests if the file is loaded, not really if it is rendered
      // we'll probably need visual regression tests for that
      cy.wait("@fontFile");

      getSdkRoot()
        .findByText("Product ID")
        .should("have.css", "font-family", "Custom");
    });
  });

  describe("modals, popovers and tooltips", () => {
    it("legacy WindowModal modals should render with our styles", () => {
      // this test renders a create dashboard modal that, at this time, is using the legacy WindowModal
      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <CreateDashboardModal />
        </MetabaseProvider>,
      );

      H.modal()
        .findByText("New dashboard")
        .should("exist")
        .and("have.css", "font-family", "Lato");

      // TODO: good place for a visual regression test
    });

    it("mantine modals should render with our styles", () => {
      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().findByText("Summarize").click();
      getSdkRoot().findByText("Count of rows").click();

      getSdkRoot()
        .findByText("Save")
        .should("exist")
        .and("have.css", "font-family", "Lato")
        .click();

      // TODO: good place for a visual regression test

      getSdkRoot().findByText("Save as new question").click();
      getSdkRoot().findByText("Our analytics").click();

      getSdkRoot()
        .findByText("Select a collection or dashboard")
        .should("exist")
        .and("have.css", "font-family", "Lato");

      // TODO: good place for a visual regression test
    });

    it("mantine modals should render with proper position", () => {
      cy.mount(
        <div style={{ paddingLeft: "9999px" }}>
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      getSdkRoot().within(() => {
        cy.findByText("Summarize").click();
        cy.findByText("Count of rows").click();
        cy.findByText("Save").click();

        cy.findByText("Save question").should("be.visible");
      });
    });

    describe("popover/tooltips/overlays styles", () => {
      beforeEach(() => {
        signInAsAdminAndEnableEmbeddingSdk();

        H.createQuestion({
          name: "Tooltip test",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
          display: "bar",
        })
          .then(({ body: { id: ordersQuestionId } }) =>
            H.createDashboard({
              dashcards: [
                {
                  id: 1,
                  size_x: 10,
                  size_y: 20,
                  row: 0,
                  col: 0,
                  card_id: ordersQuestionId,
                  parameter_mappings: [
                    {
                      parameter_id: DATE_FILTER.id,
                      card_id: ORDERS_QUESTION_ID,
                      target: ["dimension", CREATED_AT_FIELD_REF],
                    },
                  ],
                },
              ],
              parameters: [DATE_FILTER],
            }),
          )
          .then((dashboard) => {
            cy.wrap(dashboard.body.id).as("dashboardId");
          });
        cy.signOut();

        cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
        cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
          "dashcardQuery",
        );
      });

      it("should render legacy Popover with our styles", () => {
        cy.get("@dashboardId").then((dashboardId) => {
          mountSdkContent(<EditableDashboard dashboardId={dashboardId} />, {
            sdkProviderProps: {
              theme: {
                fontFamily: "Impact",
              },
            },
          });

          H.editDashboard();
          H.clickBehaviorSidebar().within(() => {
            cy.findByText("Update a dashboard filter").click();
            cy.findAllByTestId("click-target-column").first().click();
          });

          H.popover()
            .findByText("Columns")
            .should("have.css", "font-family", "Impact");
        });
      });

      it("should render Mantine tooltip with our styles", () => {
        cy.get("@dashboardId").then((dashboardId) => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />, {
            sdkProviderProps: {
              theme: {
                fontFamily: "Impact",
              },
            },
          });
        });

        getSdkRoot().findByText("Tooltip test").click();
        getSdkRoot().findByLabelText("Back to Test Dashboard").realHover();

        H.tooltip()
          .findByText("Back to Test Dashboard")
          .should("have.css", "font-family", "Impact");
      });

      it("should render echarts tooltip with our styles", () => {
        cy.get("@dashboardId").then((dashboardId) => {
          mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />, {
            sdkProviderProps: {
              theme: {
                fontFamily: "Impact",
              },
            },
          });
        });

        H.getDashboardCard(0).within(() => {
          H.chartPathWithFillColor("#509EE3").eq(0).realHover();
        });

        cy.findAllByTestId("echarts-tooltip")
          .eq(0)
          .should("exist")
          .get(".echarts-tooltip-container")
          .should("have.css", "font-family", "Impact");
      });

      it("should render DragOverlay of SortableList with our styles", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              theme: {
                fontFamily: "Impact",
              },
            },
          },
        );

        H.openVizSettingsSidebar();

        H.moveDnDKitListElement("draggable-item-", {
          startIndex: 0,
          dropIndex: 1,
          onBeforeDragEnd: () => {
            cy.get(".drag-overlay").within(() => {
              cy.findByTestId("draggable-item-ID").should(
                "have.css",
                "font-family",
                "Impact",
              );
            });
          },
        });
      });
    });
  });

  describe("Portal root element position and size", () => {
    it("should properly render full-page portal root element", () => {
      mountSdkContent(
        <>
          <div
            style={{
              padding: "30%",
            }}
          >
            <div style={{ overflow: "hidden", position: "relative" }}>
              <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
            </div>
          </div>

          <div data-testid="second-question">
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </div>
        </>,
      );

      cy.findByTestId("second-question").within(() => {
        cy.findByText("Summarize").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Count of rows").should("be.visible");
      });
    });
  });

  describe("styles should not leak outside of the provider", () => {
    const elements = [
      { tag: "body", jsx: undefined }, // no need to render anything specific, the body tag is rendered by cypress
      { tag: "h1", jsx: <h1>h1 tag text</h1> },
      { tag: "h2", jsx: <h2>h2 tag text</h2> },
      { tag: "h3", jsx: <h3>h3 tag text</h3> },
      { tag: "p", jsx: <p>p tag text</p> },
      { tag: "button", jsx: <button>button tag text</button> },
      { tag: "input", jsx: <input placeholder="input tag" type="text" /> },
      { tag: "div", jsx: <div>div tag text</div> },
      { tag: "span", jsx: <span>span tag text</span> },
      { tag: "label", jsx: <label>label tag text</label> },
      { tag: "select", jsx: <select>select tag text</select> },
      { tag: "textarea", jsx: <textarea>textarea tag text</textarea> },
    ];

    it(`no css rule should match ${elements.map((e) => e.tag).join(", ")} outside of the provider`, () => {
      cy.mount(
        <div>
          {elements.map(({ jsx }) => jsx)}
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <StaticQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </div>,
      );

      // wait for the question to load, to make sure our bundle and styles have loaded
      getSdkRoot().findByText("Product ID").should("exist");

      for (const { tag } of elements) {
        expectElementToHaveNoAppliedCssRules(tag);
      }
    });
  });
});

const expectElementToHaveNoAppliedCssRules = (selector: string) => {
  cy.get(selector).then(($el) => {
    const rules = getCssRulesThatApplyToElement($el);
    if (rules.length > 0) {
      console.warn("rules matching", selector, rules);
    }
    expect(rules, `No css rules should match ${selector}`).to.be.empty;
  });
};

const getCssRulesThatApplyToElement = ($element: JQuery<HTMLElement>) => {
  const element = $element[0];
  const rulesThatMatch: CSSStyleRule[] = Array.from(
    document.styleSheets,
  ).flatMap((sheet) => {
    const cssRules = Array.from(sheet.cssRules).filter(
      (rule) => rule instanceof CSSStyleRule,
    ) as CSSStyleRule[];

    return cssRules.filter((rule) => element.matches(rule.selectorText));
  });

  return rulesThatMatch;
};

function wrapBrowserDefaultFont() {
  cy.mount(<p>paragraph with default browser font</p>);

  cy.findByText("paragraph with default browser font").then(($element) => {
    const fontFamily = $element.css("font-family");
    cy.wrap(fontFamily).as("defaultBrowserFontFamily");
  });
}
