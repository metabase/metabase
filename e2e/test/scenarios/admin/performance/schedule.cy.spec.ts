import _ from "underscore";

import {
  describeEE,
  popover,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";
import type { ScheduleComponentType } from "metabase/components/Schedule/constants";
import type { CacheableModel } from "metabase-types/api";

import { interceptRoutes } from "./helpers/e2e-performance-helpers";
import {
  cacheStrategyForm,
  getScheduleComponent,
  openStrategyFormForDatabaseOrDefaultPolicy,
  saveCacheStrategyForm,
  scheduleRadioButton,
} from "./helpers/e2e-strategy-form-helpers";

/** These tests check that the schedule strategy form fields (in Admin /
 * Performance) send the correct cron expressions to the API. They do not check
 * that configuring the schedule strategy causes the cache to be invalidated at
 * the appointed time. Nor do they check that the cron expression retrieved
 * from the API is displayed in the UI. */
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
    [{}, "0 0 * * * ?"], // The default schedule is 'every hour, on the hour'

    [{ frequency: "daily" }, "0 0 8 * * ?"], // 8 am is the default time for a daily schedule

    [{ frequency: "hourly" }, "0 0 * * * ?"], // Check that switching back to hourly works

    [{ frequency: "daily", time: "9:00" }, "0 0 9 * * ?"], // AM is the default choice between AM and PM
    [{ frequency: "daily", time: "9:00", amPm: "PM" }, "0 0 21 * * ?"],
    [{ frequency: "daily", time: "12:00", amPm: "AM" }, "0 0 0 * * ?"],

    [ { frequency: "weekly", weekday: "Monday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 2" ],
    [ { frequency: "weekly", weekday: "Monday", time: "1:00", amPm: "AM" }, "0 0 1 ? * 2" ],

    [ { frequency: "weekly", weekday: "Tuesday", time: "2:00", amPm: "AM" }, "0 0 2 ? * 3" ],
    [ { frequency: "weekly", weekday: "Tuesday", time: "3:00", amPm: "AM" }, "0 0 3 ? * 3" ],

    [ { frequency: "weekly", weekday: "Wednesday", time: "4:00", amPm: "AM" }, "0 0 4 ? * 4" ],
    [ { frequency: "weekly", weekday: "Wednesday", time: "5:00", amPm: "AM" }, "0 0 5 ? * 4" ],

    [ { frequency: "weekly", weekday: "Thursday", time: "6:00", amPm: "AM" }, "0 0 6 ? * 5" ],
    [ { frequency: "weekly", weekday: "Thursday", time: "7:00", amPm: "AM" }, "0 0 7 ? * 5" ],

    [ { frequency: "weekly", weekday: "Friday", time: "8:00", amPm: "AM" }, "0 0 8 ? * 6" ],
    [ { frequency: "weekly", weekday: "Friday", time: "9:00", amPm: "AM" }, "0 0 9 ? * 6" ],

    [ { frequency: "weekly", weekday: "Saturday", time: "10:00", amPm: "AM" }, "0 0 10 ? * 7" ],
    [ { frequency: "weekly", weekday: "Saturday", time: "11:00", amPm: "AM" }, "0 0 11 ? * 7" ],

    [ { frequency: "weekly", weekday: "Sunday", time: "12:00", amPm: "PM" }, "0 0 12 ? * 1" ],
    [ { frequency: "weekly", weekday: "Sunday", time: "1:00", amPm: "PM" }, "0 0 13 ? * 1" ],

    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Sunday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 1#1" ],
    [ { frequency: "monthly", frame: "first", weekdayOfMonth: "Monday", time: "2:00", amPm: "AM" }, "0 0 2 ? * 2#1" ],

    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Tuesday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 3L" ],
    [ { frequency: "monthly", frame: "last", weekdayOfMonth: "Wednesday", time: "12:00", amPm: "AM" }, "0 0 0 ? * 4L" ],

    [ { frequency: "monthly", frame: "15th", time: "12:00", amPm: "AM" }, "0 0 0 15 * ?" ],
    [ { frequency: "monthly", frame: "15th", time: "11:00", amPm: "PM" }, "0 0 23 15 * ?" ],

  ];

  (["root", "database"] as CacheableModel[]).forEach(model => {
    schedules.forEach(([schedule, cronExpression]) => {
      it(`can set on ${model}: ${
        Object.values(schedule).join(" ") || "default values"
      }, yielding a cron of ${cronExpression}`, () => {
        openStrategyFormForDatabaseOrDefaultPolicy(
          model === "root" ? "default policy" : "Sample Database",
          "No caching",
        );
        scheduleRadioButton().click();
        _.pairs(schedule).forEach(([componentType, optionToClick]) => {
          if (componentType === "amPm") {
            // AM/PM is a segmented control, not a select
            cacheStrategyForm()
              .findByLabelText("AM/PM")
              .findByText(optionToClick)
              .click();
          } else {
            getScheduleComponent(componentType).click();

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
        cy.log(
          "Ensure there are no unexpected components among the schedule strategy form fields",
        );
        const expectedFieldLabels: string[] = [];
        expectedFieldLabels.push("Frequency");
        switch (schedule.frequency) {
          case undefined:
            // This means the frequency was not changed; the default frequency (hourly) is selected
            break;
          case "hourly":
            break;
          case "daily":
            expectedFieldLabels.push("Time", "AM/PM", "Your Metabase timezone");
            break;
          case "weekly":
            expectedFieldLabels.push(
              "Day of the week",
              "Time",
              "AM/PM",
              "Your Metabase timezone",
            );
            break;
          case "monthly":
            expectedFieldLabels.push("First, 15th, or last of the month");
            if (schedule.frame !== "15th") {
              expectedFieldLabels.push("Day of the month");
            }
            expectedFieldLabels.push("Time", "AM/PM", "Your Metabase timezone");
            break;
          default:
            throw new Error(
              `Unexpected schedule frequency: ${schedule.frequency}`,
            );
        }
        cacheStrategyForm()
          .findByLabelText("Describe how often the cache should be invalidated")
          .find("[aria-label]")
          .then($labels => {
            const labels = $labels
              .get()
              .map($el => $el.getAttribute("aria-label"));
            expect(labels).to.deep.equal(expectedFieldLabels);
          });
      });
    });
  });
});
