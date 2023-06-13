// import {
//   addOrUpdateDashboardCard, getDashboardCards,
//   restore, saveDashboard,
//   visitDashboard,
// } from "e2e/support/helpers";
//
// import {getDefaultSize, getMinSize} from "metabase/visualizations/shared/utils/sizes";
//
//
// describe("scenarios > dashboard card resizing", () => {
//   beforeEach(() => {
//     restore();
//     cy.signInAsAdmin();
//   });
//
//   it("should not allow cards to be resized smaller than min height", () => {
//     const initSmallSize = {width: 2, height: 2};
//     // cy.createDashboard().then(({body: {id: dashId}}) => {
//     //   cy.createNativeQuestion(createFunnelBarQuestion()).then(
//     //     ({body: {id: card_id}}) => {
//     //       addOrUpdateDashboardCard({
//     //         card_id,
//     //         dashboard_id: dashId,
//     //         card: {row: 0, col: 0, size_x: initSmallSize.width, size_y: initSmallSize.height},
//     //       });
//     //
//     //       visitDashboard(dashId);
//     //
//     //       const resizeHandle = getDashboardCards().get(".react-resizable-handle");
//     //
//     //       cy.icon("pencil").click();
//     //       resizeHandle.trigger('mousedown', {button: 0})
//     //         .trigger('mousemove', {
//     //           clientX: (getDefaultSize("funnel").width - initSmallSize.width) * 100,
//     //           clientY: (getDefaultSize("funnel").height - initSmallSize.height) * 100
//     //         }).trigger('mouseup', {force: true});
//     //
//     //       saveDashboard();
//     //
//     //       cy.icon("pencil").click();
//     //
//     //       resizeHandle.trigger('mousedown', {button: 0})
//     //         .trigger('mousemove', {
//     //           clientX: -(getDefaultSize("funnel").width - initSmallSize.width) * 100,
//     //           clientY: -(getDefaultSize("funnel").height - initSmallSize.height) * 100
//     //         }).trigger('mouseup', {force: true});
//     //
//     //       saveDashboard();
//     //
//     //       cy.request("GET", `/api/dashboard/${dashId}`).then(({body}) => {
//     //         expect(body.ordered_cards[0].size_x).to.equal(getMinSize("funnel").width);
//     //         expect(body.ordered_cards[0].size_y).to.equal(getMinSize("funnel").height);
//     //       })
//     //     },
//     //   );
//     // });
//   });
//
//   // it("should display default card size when card is added", () => {
//   //   expect(true).toEqual(true)
//   // });
// });
