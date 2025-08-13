import "@testing-library/jest-dom";
import { setProjectAnnotations } from "@storybook/react";
import fetchMock from "fetch-mock";

const preview = require("../../.storybook-dev/preview");

const annotations = setProjectAnnotations([preview.decorators]);

beforeAll(annotations.beforeAll);

beforeEach(() => {
  fetchMock.restore();
  fetchMock.catch((url, request) => {
    const errorMessage = `Caught unmocked ${request.method} request to: ${url}`;

    Promise.reject(errorMessage);

    // consider all not mocked requests are broken
    return 500;
  });
});
