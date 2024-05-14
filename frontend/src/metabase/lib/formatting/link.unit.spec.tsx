/* eslint-disable jest/expect-expect */
import { createMockColumn } from "metabase-types/api/mocks";

import type { ValueAndColumnForColumnNameDate } from "./link";
import { renderLinkURLForClick } from "./link";

const createMockLinkData = (
  params: Partial<ValueAndColumnForColumnNameDate> = {},
): ValueAndColumnForColumnNameDate => {
  return {
    column: {},
    parameter: {},
    parameterBySlug: {},
    parameterByName: {},
    userAttribute: {},
    ...params,
  };
};

describe("formatting/link", () => {
  describe("renderLinkURLForClick", () => {
    const testLinkTemplate = (
      template: string,
      data: Partial<ValueAndColumnForColumnNameDate>,
      expectedUrl: string,
    ) => {
      // eslint-disable-next-line testing-library/render-result-naming-convention
      const actualUrl = renderLinkURLForClick(
        template,
        createMockLinkData(data),
      );
      expect(actualUrl).toBe(expectedUrl);
    };

    it.each([
      "https://metabase.com",
      "http://metabase.com",
      "mailto:example@example.com",
    ])(
      "should not encode safe urls from dataset columns when a link template starts with it",
      url => {
        testLinkTemplate(
          "{{col}}",
          {
            column: {
              col: { value: url, column: createMockColumn() },
            },
          },
          url,
        );
      },
    );

    it.each([
      ["https://metabase.com", "_https%3A%2F%2Fmetabase.com"],
      ["http://metabase.com", "_http%3A%2F%2Fmetabase.com"],
      ["mailto:example@example.com", "_mailto%3Aexample%40example.com"],
    ])(
      "should encode safe urls from dataset columns when a link template does not start with it",
      (url, expectedUrl) => {
        testLinkTemplate(
          "_{{col}}",
          {
            column: {
              col: { value: url, column: createMockColumn() },
            },
          },
          expectedUrl,
        );
      },
    );

    it.each([
      [
        "javascript:alert(document.cookies)",
        "javascript%3Aalert(document.cookies)",
      ],
      [
        "tg://resolve?domain=my_support_bot",
        "tg%3A%2F%2Fresolve%3Fdomain%3Dmy_support_bot",
      ],
    ])(
      "should encode unsafe urls from dataset columns when a link template starts with it",
      (url, expectedUrl) => {
        testLinkTemplate(
          "{{col}}",
          {
            column: {
              col: { value: url, column: createMockColumn() },
            },
          },
          expectedUrl,
        );
      },
    );

    it.each([
      ["https://metabase.com", "https%3A%2F%2Fmetabase.com"],
      ["http://metabase.com", "http%3A%2F%2Fmetabase.com"],
      ["mailto:example@example.com", "mailto%3Aexample%40example.com"],
    ])(
      "should encode safe urls not from url parameters when a link template starts with it",
      (url, expectedUrl) => {
        testLinkTemplate(
          "{{param}}",
          {
            parameterBySlug: {
              param: { value: url },
            },
          },
          expectedUrl,
        );
      },
    );

    it.each([
      ["https://metabase.com", "https%3A%2F%2Fmetabase.com"],
      ["http://metabase.com", "http%3A%2F%2Fmetabase.com"],
      ["mailto:example@example.com", "mailto%3Aexample%40example.com"],
    ])(
      "should encode safe urls not from parameters when a link template starts with it",
      (url, expectedUrl) => {
        testLinkTemplate(
          "{{param}}",
          {
            parameterByName: {
              param: { value: url },
            },
          },
          expectedUrl,
        );
      },
    );

    it.each([
      ["https://metabase.com", "https%3A%2F%2Fmetabase.com"],
      ["http://metabase.com", "http%3A%2F%2Fmetabase.com"],
      ["mailto:example@example.com", "mailto%3Aexample%40example.com"],
    ])(
      "should encode safe urls not from user attributes when a link template starts with it",
      (url, expectedUrl) => {
        testLinkTemplate(
          "{{param}}",
          {
            userAttribute: {
              param: { value: url },
            },
          },
          expectedUrl,
        );
      },
    );
  });
});
