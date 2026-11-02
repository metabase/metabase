const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_QUESTION = {
  name: "Orders question",
  query: {
    "source-table": ORDERS_ID,
  },
};

const DASHBOARD_DATE_FILTER = {
  id: "1",
  name: "Date filter",
  slug: "filter-date",
  type: "date/month-year",
};

const DASHBOARD_NUMBER_FILTER = {
  id: "2",
  name: "Number filter",
  slug: "filter-number",
  type: "number/=",
};

const DASHBOARD_TEXT_FILTER = {
  id: "3",
  name: "Text filter",
  slug: "filter-text",
  type: "string/contains",
};

const DASHBOARD_LOCATION_FILTER = {
  id: "4",
  name: "Location filter",
  slug: "filter-location",
  type: "string/=",
};

const TAB_1 = {
  id: 1,
  name: "Tab 1",
};

const TAB_2 = {
  id: 2,
  name: "Tab 2",
};

describe("scenarios > dashboard > tabs", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should only display filters mapped to cards on the selected tab", () => {
    H.createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [
        DASHBOARD_DATE_FILTER,
        { ...DASHBOARD_NUMBER_FILTER, default: 20 },
        { ...DASHBOARD_TEXT_FILTER, default: "fa" },
        DASHBOARD_LOCATION_FILTER,
      ],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_1.id,
          size_x: 10,
          size_y: 4,
          parameter_mappings: [
            createDateFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            createTextFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_BY_YEAR_QUESTION_ID,
          dashboard_tab_id: TAB_2.id,
          size_x: 10,
          size_y: 4,
          parameter_mappings: [
            createDateFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
            createNumberFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
        }),
      ],
    }).then((dashboard) => H.visitDashboard(dashboard.id));

    assertFiltersVisibility({
      visible: [DASHBOARD_DATE_FILTER, DASHBOARD_TEXT_FILTER],
      hidden: [DASHBOARD_NUMBER_FILTER, DASHBOARD_LOCATION_FILTER],
    });

    cy.log("leaving edit mode should not show cards from other tabs");
    H.dashboardGrid().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
      H.getDashboardCards().should("have.length", 1);
    });

    assertFilterValues([
      [DASHBOARD_DATE_FILTER, undefined],
      [DASHBOARD_TEXT_FILTER, "fa"],
      [DASHBOARD_NUMBER_FILTER, 20],
      [DASHBOARD_LOCATION_FILTER, undefined],
    ]);

    H.goToTab(TAB_2.name);

    assertFiltersVisibility({
      visible: [DASHBOARD_DATE_FILTER, DASHBOARD_NUMBER_FILTER],
      hidden: [DASHBOARD_TEXT_FILTER, DASHBOARD_LOCATION_FILTER],
    });

    assertFilterValues([
      [DASHBOARD_DATE_FILTER, undefined],
      [DASHBOARD_TEXT_FILTER, "fa"],
      [DASHBOARD_NUMBER_FILTER, 20],
      [DASHBOARD_LOCATION_FILTER, undefined],
    ]);
  });

  it("should handle canceling adding a new tab (#38055, #38278)", () => {
    H.visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    cy.findByTestId("edit-bar").button("Cancel").click();
    H.modal().button("Discard changes").click();

    // Reproduces #38055
    H.dashboardGrid().within(() => {
      cy.findByText(/There's nothing here/).should("not.exist");
      H.getDashboardCards().should("have.length", 1);
    });

    // Reproduces #38278
    H.editDashboard();
    H.addHeadingWhileEditing("New heading");
    H.saveDashboard();
    H.dashboardGrid().within(() => {
      cy.findByText("New heading").should("exist");
      H.getDashboardCards().should("have.length", 2);
    });
  });

  it(
    "should allow moving dashcards between tabs",
    { scrollBehavior: false },
    () => {
      H.visitDashboardAndCreateTab({
        dashboardId: ORDERS_DASHBOARD_ID,
        save: false,
      });

      H.goToTab("Tab 1");

      cy.log("add second card");
      H.addLinkWhileEditing("https://www.metabase.com");

      cy.log("should stay on the same tab");
      cy.findByRole("tab", { selected: true }).should("have.text", "Tab 1");

      H.getDashboardCard(0).then((element) => {
        cy.wrap({
          width: element.outerWidth(),
          height: element.outerHeight(),
        }).as("card1OriginalSize");
      });

      H.getDashboardCard(1).then((element) => {
        cy.wrap(element.offset()).as("card2OriginalPosition");
      });

      cy.log("move second card to second tab first, then the first card");
      // moving the second card first to invert their position, this allows us
      // to check if the position is restored when undoing the movement of the second one
      H.moveDashCardToTab({ tabName: "Tab 2", dashcardIndex: 1 });
      H.moveDashCardToTab({ tabName: "Tab 2", dashcardIndex: 0 });

      cy.log("fist tab should be empty");
      cy.findAllByTestId("toast-undo").should("have.length", 2);
      H.getDashboardCards().should("have.length", 0);

      cy.log("should show undo toast with the correct text");
      cy.findByTestId("undo-list").within(() => {
        cy.findByText("Link card moved").should("be.visible");
        cy.findByText("Card moved: Orders").should("be.visible");
      });

      cy.log("cards should be in second tab");
      H.goToTab("Tab 2");
      H.getDashboardCards().should("have.length", 2);

      cy.log("size should stay the same");

      H.getDashboardCard(1).then((element) => {
        cy.get("@card1OriginalSize").then((originalSize) => {
          expect({
            width: element.outerWidth(),
            height: element.outerHeight(),
          }).to.deep.eq(originalSize);
        });
      });

      cy.log("undoing movement of second card");

      cy.findAllByTestId("toast-undo").eq(0).findByRole("button").click();

      H.goToTab("Tab 1");

      H.getDashboardCards().should("have.length", 1);

      cy.log("second card should be in the original position");

      H.getDashboardCard().then((element) => {
        cy.get("@card2OriginalPosition").then((originalPosition) => {
          const position = element.offset();
          // approximately to avoid possibly flakiness, we just want it to be in the same grid cell
          expect(position.left).to.approximately(originalPosition.left, 10);
          expect(position.top).to.approximately(originalPosition.top, 10);
        });
      });
    },
  );

  it(
    "should allow moving different types of dashcards to other tabs",
    // cy auto scroll makes the dashcard actions menu go under the header
    { scrollBehavior: false },
    () => {
      const cards = [
        H.getTextCardDetails({
          text: "Text card",
          // small card aligned to the left so that move icon is out of the viewport
          // unless the left alignment logic kicks in
          size_x: 1,
        }),
        H.getHeadingCardDetails({
          text: "Heading card",
        }),
        H.getLinkCardDetails({
          url: "https://metabase.com",
        }),
      ];

      H.createDashboard().then(({ body: { id: dashboard_id } }) => {
        H.updateDashboardCards({ dashboard_id, cards });

        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.createNewTab();
      H.goToTab("Tab 1");

      cy.log("moving dashcards to second tab");

      cards.forEach(() => {
        H.moveDashCardToTab({ tabName: "Tab 2" });
      });

      H.getDashboardCards().should("have.length", 0);

      H.goToTab("Tab 2");

      H.getDashboardCards().should("have.length", cards.length);

      cy.findAllByTestId("toast-undo").should("have.length", cards.length);

      cy.log("'Undo' toasts should be dismissed when saving the dashboard");

      H.saveDashboard();

      cy.findAllByTestId("toast-undo").should("have.length", 0);
    },
  );

  it("should allow moving dashcard even if we don't have permission on that underlying query", () => {
    const questionDetails = {
      native: {
        query: "select 42",
      },
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    };
    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        collection_id: NORMAL_PERSONAL_COLLECTION_ID,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.signInAsNormalUser();
      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    H.createNewTab();

    H.goToTab("Tab 1");

    H.getDashboardCard()
      .findByText(/you don't have permission/)
      .should("exist");

    H.moveDashCardToTab({ tabName: "Tab 2" });

    H.saveDashboard();

    H.getDashboardCards().should("have.length", 0);
  });

  it("should leave dashboard if navigating back after initial load", () => {
    H.visitDashboardAndCreateTab({ dashboardId: ORDERS_DASHBOARD_ID });
    H.visitCollection("root");

    H.main().within(() => {
      cy.findByText("Orders in a dashboard").click();
    });
    cy.go("back");
    H.main().within(() => {
      cy.findByText("Our analytics").should("be.visible");
    });
  });

  it("should only display and fetch cards on the current tab, also in public and embedded dashboards", () => {
    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboardCards");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    cy.findByRole("heading", {
      name: "Create a new question or browse your collections for an existing one.",
    }).should("exist");
    H.dashboardGrid().should("not.exist");

    // Add card to second tab
    H.openQuestionsSidebar();
    H.sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });

    cy.wait("@cardQuery");

    H.saveDashboard();
    cy.url().should("match", /\d+\-tab\-2/); // id is not stable

    cy.wait("@saveDashboardCards").then(({ response }) => {
      cy.wrap(response.body.dashcards[1].id).as("secondTabDashcardId");
    });

    // it's possible to have two requests firing (but first one is canceled before running second)
    cy.intercept(
      "POST",
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}/query`,
      cy.spy().as("firstTabQuerySpy"),
    ).as("firstTabQuery");

    cy.get("@secondTabDashcardId").then((secondTabDashcardId) => {
      cy.intercept(
        "POST",
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}/query`,
        cy.spy().as("secondTabQuerySpy"),
      ).as("secondTabQuery");
    });

    const firstQuestion = () => {
      return cy.request("GET", `/api/card/${ORDERS_QUESTION_ID}`).its("body");
    };
    const secondQuestion = () => {
      return cy
        .request("GET", `/api/card/${ORDERS_COUNT_QUESTION_ID}`)
        .its("body");
    };

    firstQuestion().then((r) => {
      cy.wrap(r.view_count).should("equal", 1);
    });
    secondQuestion().then((r) => {
      cy.wrap(r.view_count).should("equal", 1);
    });

    // Visit first tab and confirm only first card was queried
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.get("@firstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@secondTabQuerySpy").should("not.have.been.called");
    cy.wait("@firstTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 1 (previously) + 1 (firstQuestion)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(1); // 1 (previously)
      });
    });

    // Visit second tab and confirm only second card was queried
    H.goToTab("Tab 2");
    cy.get("@secondTabQuerySpy").should("have.been.calledOnce");
    cy.get("@firstTabQuerySpy").should("have.been.calledOnce");
    cy.wait("@secondTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 2 (previously)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 1(previously) + 1 (secondTabQuery)
      });
    });

    // Go back to first tab, expect no additional queries
    H.goToTab("Tab 1");
    cy.findAllByTestId("dashcard").contains("37.65");
    H.dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });
    cy.get("@firstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@secondTabQuerySpy").should("have.been.calledOnce");

    firstQuestion().then((r) => {
      expect(r.view_count).to.equal(2); // 2 (previously)
    });
    secondQuestion().then((r) => {
      expect(r.view_count).to.equal(2); // 2 (previously)
    });

    // Go to public dashboard
    H.updateSetting("enable-public-sharing", true);
    cy.request(
      "POST",
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/public_link`,
    ).then(({ body: { uuid } }) => {
      cy.intercept(
        "GET",
        `/api/public/dashboard/${uuid}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}?parameters=%5B%5D`,
        cy.spy().as("publicFirstTabQuerySpy"),
      ).as("publicFirstTabQuery");
      cy.get("@secondTabDashcardId").then((secondTabDashcardId) => {
        cy.intercept(
          "GET",
          `/api/public/dashboard/${uuid}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}?parameters=%5B%5D`,
          cy.spy().as("publicSecondTabQuerySpy"),
        ).as("publicSecondTabQuery");
      });

      cy.visit(`public/dashboard/${uuid}`);
    });

    // Check first tab requests
    cy.get("@publicFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuerySpy").should("not.have.been.called");
    cy.wait("@publicFirstTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(3); // 2 (previously) + 1 (publicFirstTabQuery)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 2 (previously)
      });
    });

    // Visit second tab and confirm only second card was queried
    H.goToTab("Tab 2");
    cy.get("@publicSecondTabQuerySpy").should("have.been.calledOnce");
    cy.get("@publicFirstTabQuerySpy").should("have.been.calledOnce");
    cy.wait("@publicSecondTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(3); // 3 (previously)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(3); // 2 (previously) + 1 (publicSecondTabQuery)
      });
    });

    H.goToTab("Tab 1");
    cy.get("@publicFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuerySpy").should("have.been.calledOnce");

    cy.log("static embedding");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.intercept(
      "GET",
      `/api/embed/dashboard/*/dashcard/*/card/${ORDERS_QUESTION_ID}*`,
      cy.spy().as("embedFirstTabQuerySpy"),
    ).as("embedFirstTabQuery");
    cy.intercept(
      "GET",
      `/api/embed/dashboard/*/dashcard/*/card/${ORDERS_COUNT_QUESTION_ID}*`,
      cy.spy().as("embedSecondTabQuerySpy"),
    ).as("embedSecondTabQuery");

    H.openLegacyStaticEmbeddingModal({
      resource: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
      activeTab: "parameters",
    });

    // publish the embedded dashboard so that we can directly navigate to its url
    H.publishChanges("dashboard", () => {});

    // directly navigate to the embedded dashboard, starting on Tab 1
    H.visitIframe();
    // wait for results
    cy.findAllByTestId("dashcard").contains("37.65");
    cy.get("@embedFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@embedSecondTabQuerySpy").should("not.have.been.called");

    cy.wait("@embedFirstTabQuery");

    H.goToTab("Tab 2");
    cy.get("@embedSecondTabQuerySpy").should("have.been.calledOnce");
    cy.get("@embedFirstTabQuerySpy").should("have.been.calledOnce");
    cy.wait("@embedSecondTabQuery");

    H.goToTab("Tab 1");
    cy.get("@embedFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@embedSecondTabQuerySpy").should("have.been.calledOnce");
  });

  it("should apply filter and show loading spinner when changing tabs (#33767)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.createNewTab();
    H.saveDashboard();

    H.goToTab("Tab 2");
    H.editDashboard();
    H.openQuestionsSidebar();
    H.sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });

    H.setFilter("Date picker", "Relative Date");

    H.selectDashboardFilter(H.getDashboardCard(0), "Created At");
    H.saveDashboard();

    cy.intercept(
      "POST",
      "/api/dashboard/*/dashcard/*/card/*/query",
      delayResponse(500),
    ).as("saveCard");

    H.filterWidget().click();
    H.popover().findByText("Previous 7 days").click();

    // Loader in the 2nd tab
    H.getDashboardCard(0).within(() => {
      cy.findByTestId("loading-indicator").should("exist");
      cy.wait("@saveCard");
      cy.findAllByRole("row").should("exist");
    });

    // we do not auto-wire automatically in different tabs anymore, so first tab
    // should not show a loader and re-run query
    H.goToTab("Tab 1");
    H.getDashboardCard(0).within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findAllByRole("row").should("exist");
    });
  });

  it("should allow me to rearrange long tabs (#34970)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.createNewTab();
    H.createNewTab();

    // Assert initial tab order
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 2");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 3");

    // Prior to this bugfix, tab containing this text would be too long to drag to the left of either of the other tabs.
    const longName = "This is a really really long tab name";

    cy.findByRole("tab", { name: "Tab 3" })
      .dblclick()
      .type(`${longName}{enter}`)
      .trigger("mousedown", { button: 0, force: true })
      .trigger("mousemove", {
        button: 0,
        // You have to move the mouse at least 10 pixels to satisfy the
        // activationConstraint: { distance: 10 } in the mouseSensor. If you
        // remove that activationConstraint while still having the mouseSensor
        // (required to make this pass), then the tests in
        // DashboardTabs.unit.spec.tsx will fail.
        clientX: 11,
        clientY: 0,
      })
      .trigger("mousemove", {
        button: 0,
        clientX: 11,
        clientY: 0,
      })
      // UI requires time to update, causes flakiness without the delay
      .wait(100)
      .trigger("mouseup");

    // After the long tab is dragged, it is now in the first position. We need
    // to assert this before saving, to make sure the dragging animation
    // finishes before trying to click "Save"
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText(longName);
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 2");

    H.saveDashboard();

    // Confirm positions are the same after saving
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText(longName);
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 2");
  });

  it("should allow users to duplicate, delete and undo deleting tabs more than once (#45364)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.duplicateTab("Tab 1");

    cy.findAllByRole("tab").eq(0).should("have.text", "Tab 1");
    cy.findAllByRole("tab").eq(1).should("have.text", "Copy of Tab 1");

    H.duplicateTab("Tab 1");

    cy.findAllByRole("tab").eq(0).should("have.text", "Tab 1");
    cy.findAllByRole("tab").eq(1).should("have.text", "Copy of Tab 1");
    cy.findAllByRole("tab").eq(2).should("have.text", "Copy of Tab 1");

    H.deleteTab("Tab 1");
    cy.findByRole("tab", { name: "Tab 1" }).should("not.exist");

    cy.log("undo restores the deleted tab with its cards");
    H.undo();
    H.goToTab("Tab 1");
    H.dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });

    // Delete Tab 1 while another tab is selected, as before the undo
    cy.findAllByRole("tab", { name: "Copy of Tab 1" })
      .should("have.length", 2)
      .last()
      .click();
    H.deleteTab("Tab 1");

    cy.findAllByRole("tab").eq(0).should("have.text", "Copy of Tab 1");
    cy.findAllByRole("tab").eq(1).should("have.text", "Copy of Tab 1");

    cy.findAllByRole("tab").eq(0).findByRole("button").click();
    H.popover().within(() => {
      cy.findByText("Delete").click();
    });

    cy.findByRole("tab").should("have.text", "Copy of Tab 1");
  });
});

const CATEGORY_PARAMETER = createMockParameter({
  id: "2",
  name: "Category",
  type: "string/=",
});

const PRODUCTS_QUESTION_DETAILS = {
  name: "Products",
  query: { "source-table": PRODUCTS_ID },
};

function createMappedDashcard(mappedQuestionId) {
  return createMockDashboardCard({
    id: 1,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: CATEGORY_PARAMETER.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 0,
    col: 0,
    size_x: 10,
    size_y: 5,
  });
}

describe("scenarios > dashboard > tabs > snowplow", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when tabs are created and deleted and cards are moved between them", () => {
    const cardMovedEventName = "card_moved_to_tab";

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.assertNoUnstructuredSnowplowEvent({ event: cardMovedEventName });

    H.editDashboard();
    H.createNewTab();
    H.goToTab("Tab 1");

    H.moveDashCardToTab({ tabName: "Tab 2" });
    H.expectUnstructuredSnowplowEvent({ event: cardMovedEventName });

    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_tab_created" });

    H.editDashboard();
    H.deleteTab("Tab 1");
    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" }, 2);
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_tab_deleted" });
  });

  it("should allow the user to duplicate a dashcard and a tab", () => {
    H.createQuestion(PRODUCTS_QUESTION_DETAILS).then(
      ({ body: { id: mappedQuestionId } }) => {
        H.createDashboard({ parameters: [CATEGORY_PARAMETER] }).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [createMappedDashcard(mappedQuestionId)],
            });
            H.visitDashboard(dashboardId);
          },
        );
      },
    );

    cy.log("duplicate a dashcard");
    cy.findByLabelText("Edit dashboard").click();

    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Duplicate")
      .click();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_card_duplicated" });

    // check that the new card loads _before_ saving
    cy.findAllByText("Products").should("have.length", 2);
    // Also confirm with the card content (VIZ-289)
    cy.findAllByText("Small Marble Shoes").should("have.length", 2);

    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });

    cy.log("duplicate a tab");
    cy.findByLabelText("Edit dashboard").click();

    H.duplicateTab("Tab 1");
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_tab_duplicated" });
    H.getDashboardCard().within(() => {
      cy.findByText("Products").should("exist");
      cy.findByText("Category").should("exist");
      cy.findByText(/(Problem|Error)/i).should("not.exist");
    });
    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" }, 2);

    cy.log("the filter applies to the duplicated cards on both tabs");
    H.assertTabSelected("Copy of Tab 1");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    cy.findAllByText("Incredible Bronze Pants").should("have.length", 2);

    H.goToTab("Tab 1");
    cy.findAllByText("Incredible Bronze Pants").should("have.length", 2);
  });
});

describe("scenarios > dashboard > tabs > add a question to an empty dashboard with tabs (metabase#61013)", () => {
  const dashboardName = "Dashboard 61013";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createDashboardWithTabs({
      name: dashboardName,

      tabs: [
        {
          id: 1,
          name: "Tab 1",
        },
        {
          id: 2,
          name: "Tab 2",
        },
      ],
    });
  });

  it("should only add one card and save correctly to the dashboard when the dashboard is empty but has multiple tabs (metabase#61013)", () => {
    H.createQuestion(ORDERS_QUESTION).then(({ body }) =>
      H.visitQuestion(body.id),
    );

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Add to dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("Search…").type(dashboardName);
      cy.findByText(dashboardName).click();
      cy.findByTestId("entity-picker-select-button").click();
    });

    H.getDashboardCards().should("have.length", 1);
    H.getDashboardCard(0).within(() => {
      cy.findByText("Orders question").should("be.visible");
      cy.findByText("Showing first 2,000 rows").should("be.visible");
    });

    cy.findByTestId("edit-bar")
      .findByText("You're editing this dashboard.")
      .should("be.visible");

    H.saveDashboard();

    H.getDashboardCards().should("have.length", 1);
    H.getDashboardCard(0).within(() => {
      cy.findByText("Orders question").should("be.visible");
      cy.findByText("Showing first 2,000 rows").should("be.visible");
    });
  });

  it("should not wait for cards to load before switching to edit mode", () => {
    slowDownCardQuery();

    // visitQuestion waits for the query, which we don't want here.
    // we just want to visit the dashboard directly
    H.createQuestion(ORDERS_QUESTION, { visitQuestion: false }).then(
      ({ body }) => cy.visit(`/question/${body.id}`),
    );

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Add to dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("Search…").type(dashboardName);
      cy.findByText(dashboardName).click();
      cy.findByTestId("entity-picker-select-button").click();
    });

    cy.findByTestId("edit-bar")
      .findByText("You're editing this dashboard.")
      .should("be.visible");
    H.getDashboardCard(0)
      .findByTestId("loading-indicator")
      .should("be.visible");
  });
});

describe("scenarios > dashboard > tabs > query reruns when switching tabs (metabase#39863)", () => {
  const DATE_FILTER = {
    id: "2",
    name: "Date filter",
    slug: "filter-date",
    type: "date/all-options",
  };

  const CREATED_AT_FIELD_REF = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  const ID_FILTER = {
    id: "3",
    name: "ID filter",
    slug: "filter-id",
    type: "id",
  };

  const USER_ID_FILTER = {
    id: "4",
    name: "User ID filter",
    slug: "filter-user-id",
    type: "id",
  };

  const PRODUCT_ID_FILTER = {
    id: "5",
    name: "Product ID filter",
    slug: "filter-product-id",
    type: "id",
  };

  const SUBTOTAL_FILTER = {
    id: "6",
    name: "Subtotal filter",
    slug: "filter-subtotal",
    type: "number/<=",
  };

  const TOTAL_FILTER = {
    id: "7",
    name: "Total filter",
    slug: "filter-total",
    type: "number/<=",
  };

  const TAX_FILTER = {
    id: "8",
    name: "Tax filter",
    slug: "filter-tax",
    type: "number/<=",
  };

  const DISCOUNT_FILTER = {
    id: "9",
    name: "Discount filter",
    slug: "filter-discount",
    type: "number/<=",
  };

  const QUANTITY_FILTER = {
    id: "10",
    name: "Quantity filter",
    slug: "filter-quantity",
    type: "number/<=",
  };

  const ID_FIELD_REF = ["field", ORDERS.ID, { "base-type": "type/BigInteger" }];

  const USER_ID_FIELD_REF = [
    "field",
    ORDERS.USER_ID,
    { "base-type": "type/BigInteger" },
  ];

  const PRODUCT_ID_FIELD_REF = [
    "field",
    ORDERS.PRODUCT_ID,
    { "base-type": "type/BigInteger" },
  ];

  const SUBTOTAL_FIELD_REF = [
    "field",
    ORDERS.SUBTOTAL,
    { "base-type": "type/Float" },
  ];

  const TOTAL_FIELD_REF = [
    "field",
    ORDERS.TOTAL,
    { "base-type": "type/Float" },
  ];

  const TAX_FIELD_REF = ["field", ORDERS.TAX, { "base-type": "type/Float" }];

  const DISCOUNT_FIELD_REF = [
    "field",
    ORDERS.DISCOUNT,
    { "base-type": "type/Float" },
  ];

  const QUANTITY_FIELD_REF = [
    "field",
    ORDERS.QUANTITY,
    { "base-type": "type/Number" },
  ];

  const DASHCARD_WITH_9_FILTERS = {
    card_id: ORDERS_QUESTION_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
      {
        parameter_id: ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", ID_FIELD_REF],
      },
      {
        parameter_id: USER_ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", USER_ID_FIELD_REF],
      },
      {
        parameter_id: PRODUCT_ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", PRODUCT_ID_FIELD_REF],
      },
      {
        parameter_id: SUBTOTAL_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", SUBTOTAL_FIELD_REF],
      },
      {
        parameter_id: TOTAL_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", TOTAL_FIELD_REF],
      },
      {
        parameter_id: TAX_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", TAX_FIELD_REF],
      },
      {
        parameter_id: DISCOUNT_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", DISCOUNT_FIELD_REF],
      },
      {
        parameter_id: QUANTITY_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", QUANTITY_FIELD_REF],
      },
    ],
    size_x: 10,
    size_y: 4,
  };

  function setDateFilter() {
    cy.findByLabelText("Date filter").click();
    H.popover()
      .findByText(/Previous 12 months/i)
      .click();
  }

  function assertNoLoadingSpinners() {
    H.dashboardGrid()
      .findAllByTestId("loading-indicator")
      .should("have.length", 0);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not rerun queries just because there are 9 or more attached filters to a dash-card", () => {
    H.createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [
        DATE_FILTER,
        ID_FILTER,
        USER_ID_FILTER,
        PRODUCT_ID_FILTER,
        SUBTOTAL_FILTER,
        TOTAL_FILTER,
        TAX_FILTER,
        DISCOUNT_FILTER,
        QUANTITY_FILTER,
      ],
      dashcards: [
        createMockDashboardCard({
          ...DASHCARD_WITH_9_FILTERS,
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          ...DASHCARD_WITH_9_FILTERS,
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    }).then((dashboard) => H.visitDashboard(dashboard.id));

    // Initial query for 1st tab
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 1);

    // Initial query for 2nd tab
    H.goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // No parameters change, no query rerun
    H.goToTab(TAB_1.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // Rerun 1st tab query with new parameters
    setDateFilter();
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 3);

    // Rerun 2nd tab query with new parameters
    H.goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);

    // No parameters change, no query rerun
    H.goToTab(TAB_1.name);
    H.goToTab(TAB_2.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);
  });
});

/**
 * When you need to postpone a response (to check for loading spinners or alike),
 * use this:
 *
 * `cy.intercept('POST', path, delayResponse(1000)).as('delayed')`
 *
 * `cy.wait('@delayed')` - you'll have 1000 ms until this resolves
 */
function delayResponse(delayMs) {
  return function (req) {
    req.on("response", (res) => {
      res.setDelay(delayMs);
    });
  };
}

const createTextFilterMapping = ({ card_id }) => {
  const fieldRef = [
    "field",
    PEOPLE.NAME,
    {
      "base-type": "type/Text",
      "source-field": ORDERS.USER_ID,
    },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_TEXT_FILTER.id,
    target: ["dimension", fieldRef],
  };
};

const createDateFilterMapping = ({ card_id }) => {
  const fieldRef = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_DATE_FILTER.id,
    target: ["dimension", fieldRef],
  };
};

const createNumberFilterMapping = ({ card_id }) => {
  const fieldRef = ["field", ORDERS.QUANTITY, { "base-type": "type/Number" }];

  return {
    card_id,
    parameter_id: DASHBOARD_NUMBER_FILTER.id,
    target: ["dimension", fieldRef],
  };
};

function assertFiltersVisibility({ visible = [], hidden = [] }) {
  // A filter with a value shows it next to its name, e.g. "Text filter: fa"
  const nameMatcher = (filter) => new RegExp(`^${filter.name}`);

  cy.findByTestId("dashboard-parameters-widget-container").within(() => {
    visible.forEach((filter) =>
      cy.findByText(nameMatcher(filter)).should("exist"),
    );
    hidden.forEach((filter) =>
      cy.findByText(nameMatcher(filter)).should("not.exist"),
    );
  });

  // Ensure all filters are visible in edit mode
  H.editDashboard();
  cy.findByTestId("edit-dashboard-parameters-widget-container").within(() => {
    [...visible, ...hidden].forEach((filter) =>
      cy.findByText(nameMatcher(filter)).should("exist"),
    );
  });

  cy.findByTestId("edit-bar").button("Cancel").click();
}

function assertFilterValues(filterValues) {
  filterValues.forEach(([filter, value]) => {
    const displayValue = value === undefined ? "" : value.toString();
    const filterQueryParameter = `${filter.slug}=${displayValue}`;
    cy.location("search").should("contain", filterQueryParameter);
  });
}

function slowDownCardQuery() {
  return cy.intercept("POST", "/api/card/*/query", (req) => {
    req.on("response", (res) => {
      res.setDelay(300000);
    });
  });
}
