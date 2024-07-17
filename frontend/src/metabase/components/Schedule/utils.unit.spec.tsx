import { render, screen } from "@testing-library/react";

import type { SelectProps } from "metabase/ui";

import { addScheduleComponents, getLongestSelectLabel } from "./utils";

describe("utils", () => {
  describe("addScheduleComponents", () => {
    // Mock translation dictionary
    const translations = {
      // English strings
      en: {
        /* This string contains placeholders. {0} is a verb like 'Send',
         * {1} is an adverb like 'hourly',
         * {2} is an adjective like 'first',
         * {3} is a day like 'Tuesday',
         * {4} is a time like '12:00pm' */
        "{0} {1} on the {2} {3} at {4}": "{0} {1} on the {2} {3} at {4}",
        invalidate: "Invalidate",
        monthly: "monthly",
        first: "first",
        tuesday: "Tuesday",
        twelvePm: "12:00pm",
      },
      // German translations
      de: {
        /* This string contains placeholders. {0} is a verb like 'Send',
         * {1} is an adverb like 'hourly',
         * {2} is an adjective like 'first',
         * {3} is a day like 'Tuesday',
         * {4} is a time like '12:00pm' */
        "{0} {1} on the {2} {3} at {4}": "{1} am {2} {3} um {4} {0}", // The order is different in German
        invalidate: "ungültig machen",
        monthly: "monatlich",
        first: "erste",
        tuesday: "Dienstag",
        twelvePm: "12:00 Uhr",
      },
    };

    it("can add components to an untranslated (English) string", () => {
      const { invalidate, monthly, first, tuesday, twelvePm } = translations.en;
      const scheduleDescription =
        translations.en["{0} {1} on the {2} {3} at {4}"];
      const scheduleReactNode = addScheduleComponents(scheduleDescription, [
        <div key="verb">{invalidate} </div>,
        <div key="frequency">{monthly} </div>,
        <div key="frame">{first} </div>,
        <div key="weekday-of-month">{tuesday} </div>,
        <div key="time">{twelvePm} </div>,
      ]);
      render(<div data-testid="schedule">{scheduleReactNode}</div>);
      const scheduleElement = screen.getByTestId("schedule");
      expect(scheduleElement).toHaveTextContent(
        "Invalidate monthly on the first Tuesday at 12:00pm",
      );
    });

    it("can add components to a string translated into German", () => {
      const { invalidate, monthly, first, tuesday, twelvePm } = translations.de;
      const scheduleDescription =
        translations.de["{0} {1} on the {2} {3} at {4}"];
      const scheduleReactNode = addScheduleComponents(scheduleDescription, [
        <div key="verb">{invalidate} </div>,
        <div key="frequency">{monthly} </div>,
        <div key="frame">{first} </div>,
        <div key="weekday-of-month">{tuesday} </div>,
        <div key="time">{twelvePm} </div>,
      ]);
      render(<div data-testid="schedule">{scheduleReactNode}</div>);
      const scheduleElement = screen.getByTestId("schedule");
      expect(scheduleElement).toHaveTextContent(
        "monatlich am erste Dienstag um 12:00 Uhr ungültig machen",
      );
    });
  });

  describe("getLongestSelectLabel", () => {
    it("should return the longest label from an array of strings", () => {
      const data: SelectProps["data"] = [
        "short",
        "medium length",
        "the longest string in the array",
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("the longest string in the array");
    });

    it("should return the longest label from an array of objects", () => {
      const data: SelectProps["data"] = [
        { value: "short", label: "short" },
        { value: "medium", label: "medium length" },
        { value: "long", label: "the longest string in the array" },
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("the longest string in the array");
    });

    it("should return the longest label from a mixed array", () => {
      const data: SelectProps["data"] = [
        "short",
        { value: "value", label: "the longest string in the array" },
        "medium length",
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("the longest string in the array");
    });

    it("should return an empty string if data is empty", () => {
      const data: SelectProps["data"] = [];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("");
    });

    it("should return an empty string if all objects have no labels", () => {
      const data: SelectProps["data"] = [
        { value: "first" },
        { value: "second" },
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("");
    });

    it("should handle undefined labels in objects", () => {
      const data: SelectProps["data"] = [
        { value: "first", label: undefined },
        { value: "second", label: "valid label" },
      ];
      const result = getLongestSelectLabel(data);
      expect(result).toBe("valid label");
    });
  });
});
