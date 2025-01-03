import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";

import { H } from "e2e/support";
dayjs.extend(timezone);

import {
  freezeServerTime,
  resetServerTime,
} from "./helpers/e2e-performance-helpers";

/** Some caching tests need to be able to advance the server clock manually.
 * There's an endpoint that supports this: /api/testing/set-time.
 * These tests guarantee that this endpoint works as expected. */
describe("server clock", () => {
  beforeEach(() => {
    H.restore();
    resetServerTime();
    cy.signInAsAdmin();
  });

  it("can advance the server clock by one day", () => {
    cy.request("GET", "/api/setting/report-timezone-long").then(response => {
      cy.wrap(response.body).as("serverTimeZone");
    });

    cy.then(function () {
      const oneDayInMilliseconds = 86400000;

      const utcFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const nowInUTC = utcFormatter.format(Date.now());

      const tomorrowInUTC: string = dayjs(nowInUTC)
        .add(1, "day")
        .format("YYYY-MM-DD");

      freezeServerTime({
        addMilliseconds: oneDayInMilliseconds,
        wrapServerTimeAs: "serverTimeInUTC",
      });

      cy.then(function () {
        const serverDate = this.serverTimeInUTC.split("T")[0];
        expect(serverDate).to.eq(tomorrowInUTC);
      });
    });
  });

  it("server clock remains stopped once manually set", () => {
    const oneDayInMilliseconds = 86400000;
    freezeServerTime({
      addMilliseconds: oneDayInMilliseconds,
      wrapServerTimeAs: "previousServerTime",
    });
    cy.wait(500);
    freezeServerTime({ addMilliseconds: 0, wrapServerTimeAs: "newServerTime" });
    cy.then(function () {
      expect(
        this.newServerTime,
        "Even though 500ms of real time have elapsed, the server's clock is the same as before",
      ).to.eq(this.previousServerTime);
    });
  });
});
