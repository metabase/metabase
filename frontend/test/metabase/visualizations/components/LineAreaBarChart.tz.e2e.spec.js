import React from "react";

jest.mock("metabase/components/ExplicitSize");

import { useSharedAdminLogin, createTestStore } from "__support__/e2e_tests";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";

import { mount } from "enzyme";

const expectedByReportingTZ = {
  "US/Pacific": {
    ticks: ["March 09, 2019", "March 10, 2019"],
    yValues: [16, 23],
  },
  "Asia/Hong_Kong": {
    ticks: ["March 09, 2019", "March 10, 2019"],
    yValues: [24, 24],
  },
};

const clientTZ = process.env["TZ"];
const serverTZ = process.env["SERVER_TZ"];

describe("LineAreaBarChart", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  it(`should display correctly with server tz ${serverTZ} and client tz ${clientTZ}`, async () => {
    const store = await createTestStore();
    store.pushPath("/question/1");
    const app = mount(store.connectContainer(<QueryBuilder />));
    await new Promise(r => setTimeout(r, 5000));

    const expected = expectedByReportingTZ[serverTZ];
    if (!expected) {
      throw new Error(`Missing expected for server timezone: ${serverTZ}`);
    }

    const qsa = s => Array.from(app.getDOMNode().querySelectorAll(s));

    const ticks = qsa(".axis.x .tick text").map(n => n.textContent);
    expect(ticks).toEqual(expected.ticks);

    const yValues = qsa(".bar").map(n => n.__data__.y);
    expect(yValues).toEqual(expected.yValues);
  });
});
