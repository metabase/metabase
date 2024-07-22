import _ from "underscore";

import {
  describeEE,
  popover,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";
import {
  type ScheduleComponentType,
  getScheduleComponentLabel,
} from "metabase/components/Schedule/constants";
import type { CacheableModel } from "metabase-types/api";

import { interceptRoutes } from "./helpers/e2e-performance-helpers";
import {
  cacheStrategyForm,
  dontCacheResultsRadioButton,
  openStrategyFormForDatabaseOrDefaultPolicy,
  saveCacheStrategyForm,
  scheduleRadioButton,
} from "./helpers/e2e-strategy-form-helpers";

/** These tests just check that the schedule strategy form fields send
 * the correct cron expressions to the API and display the cron expression
 * stored in the API. They do NOT check that configuring the schedule
 * strategy causes the cache to be invalidated at the appointed time. */
describeEE("scenarios > admin > performance > schedule strategy", () => {
  beforeEach(() => {
    restore();
    interceptRoutes();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  /** An object describing the values to enter in the schedule strategy configuration form. */
  type FormValues = Partial<Record<ScheduleComponentType, string>>;

  type ScheduleTestOptions = [
    FormValues,
    /** The cron expression we expect to be sent to the API. */
    string,
  ];

  // prettier-ignore
  const schedules: ScheduleTestOptions[] = [
    // The default schedule is 'every hour, on the hour'
    //// [{}, "0 0 * * * ?"],
    //// // 8 am is the default time for a daily schedule
    //// [{ frequency: "daily" }, "0 0 8 * * ?"],
    //// // Check that switching back to hourly works
    //// [{ frequency: "hourly" }, "0 0 * * * ?"],
    //// // AM is the default choice between AM and PM
    //// [{ frequency: "daily", time: "9:00" }, "0 0 9 * * ?"],
    //// // Check that PM works
    //// [{ frequency: "daily", time: "9:00", amPm: "PM" }, "0 0 21 * * ?"],
    //// // Check that 12:00 AM works
    //// [{ frequency: "daily", time: "12:00", amPm: "AM" }, "0 0 0 * * ?"],

    // [ { frequency: "weekly", weekday: "Mondays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 2" ],
    // [ { frequency: "weekly", weekday: "Mondays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 2" ],

    // [ { frequency: "weekly", weekday: "Tuesdays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 3" ],
    // [ { frequency: "weekly", weekday: "Tuesdays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 3" ],

    // [ { frequency: "weekly", weekday: "Wednesdays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 4" ],
    // [ { frequency: "weekly", weekday: "Wednesdays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 4" ],

    // [ { frequency: "weekly", weekday: "Thursdays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 5" ],
    // [ { frequency: "weekly", weekday: "Thursdays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 5" ],

    // [ { frequency: "weekly", weekday: "Fridays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 6" ],
    // [ { frequency: "weekly", weekday: "Fridays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 6" ],

    // [ { frequency: "weekly", weekday: "Saturdays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 7" ],
    // [ { frequency: "weekly", weekday: "Saturdays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 7" ],

    // [ { frequency: "weekly", weekday: "Sundays", time: "12:00", amPm: "AM" }, "0 0 0 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "1:00", amPm: "AM" }, "0 0 1 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "2:00", amPm: "AM" }, "0 0 2 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "3:00", amPm: "AM" }, "0 0 3 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "4:00", amPm: "AM" }, "0 0 4 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "5:00", amPm: "AM" }, "0 0 5 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "6:00", amPm: "AM" }, "0 0 6 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "7:00", amPm: "AM" }, "0 0 7 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "8:00", amPm: "AM" }, "0 0 8 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "9:00", amPm: "AM" }, "0 0 9 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "10:00", amPm: "AM" }, "0 0 10 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "11:00", amPm: "AM" }, "0 0 11 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "12:00", amPm: "PM" }, "0 0 12 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "1:00", amPm: "PM" }, "0 0 13 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "2:00", amPm: "PM" }, "0 0 14 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "3:00", amPm: "PM" }, "0 0 15 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "4:00", amPm: "PM" }, "0 0 16 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "5:00", amPm: "PM" }, "0 0 17 ? * 1" ],
    [ { frequency: "weekly", weekday: "Sundays", time: "6:00", amPm: "PM" }, "0 0 18 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "7:00", amPm: "PM" }, "0 0 19 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "8:00", amPm: "PM" }, "0 0 20 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "9:00", amPm: "PM" }, "0 0 21 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "10:00", amPm: "PM" }, "0 0 22 ? * 1" ],
    // [ { frequency: "weekly", weekday: "Sundays", time: "11:00", amPm: "PM" }, "0 0 23 ? * 1" ],

    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Sunday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 1#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Monday", time: "2:00", amPm: "AM" }, "0 0 2 ? * 2#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Tuesday", time: "4:00", amPm: "AM" }, "0 0 4 ? * 3#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Wednesday", time: "11:00", amPm: "AM" }, "0 0 11 ? * 4#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Thursday", time: "1:00", amPm: "PM" }, "0 0 13 ? * 5#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Friday", time: "4:00", amPm: "PM" }, "0 0 16 ? * 6#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Saturday", time: "11:00", amPm: "PM" }, "0 0 23 ? * 7#1" ],

    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Sunday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 1L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Monday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 2L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Tuesday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 3L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Wednesday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 4L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Thursday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 5L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Friday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 6L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Saturday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 7L" ],

    [ { frequency: "monthly", frame: "15th", time: "12:00", amPm: "AM" }, "0 0 0 15 * ?" ],

  ];
  const getComponent = (componentType: ScheduleComponentType) =>
    cacheStrategyForm().findByLabelText(
      getScheduleComponentLabel(componentType),
    );
  schedules.forEach(([scheduleParts, cronExpression]) => {
    (
      [
        "root",
        //"database" // FIXME: Bring back database-specific tests
      ] as CacheableModel[]
    ).forEach((model, index) => {
      it(`can set on ${model}: ${Object.values(scheduleParts).join(
        " ",
      )}, yielding a cron of ${cronExpression}`, () => {
        if (index === 0) {
          openStrategyFormForDatabaseOrDefaultPolicy(
            "default policy",
            "No caching",
          );
        } else {
          dontCacheResultsRadioButton().click();
        }
        scheduleRadioButton().click();
        _.pairs(scheduleParts).forEach(([componentType, optionToClick]) => {
          if (componentType === "amPm") {
            // AM/PM is a segmented control, not a select
            cacheStrategyForm()
              .findByLabelText("AM/PM")
              .findByText(optionToClick)
              .click();
          } else {
            getComponent(componentType).click();

            popover().within(() => {
              cy.findByText(optionToClick).click();
            });
          }
        });
        saveCacheStrategyForm().then(xhr => {
          const { body } = xhr.request;
          expect(body.model).to.eq(model);
          expect(body.strategy.schedule).to.eq(cronExpression);
        });
        const scheduleStrategyFormFields = cacheStrategyForm().findByLabelText(
          "Describe how often the cache should be invalidated",
        );
        cy.log(
          "Ensure there are no unexpected components among the schedule strategy form fields",
        );
        scheduleStrategyFormFields.within(() => {
          cy.get("[aria-label]").should(
            "have.length",
            // We also expect an element displaying the timezone, with an aria-label, so we need to add 1 here
            Object.keys(scheduleParts).length + 1,
          );
        });
      });
    });
  });
});
