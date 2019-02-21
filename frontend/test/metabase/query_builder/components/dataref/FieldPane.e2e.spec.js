import { useSharedAdminLogin, createTestStore } from "__support__/e2e_tests";
import { click } from "__support__/enzyme_utils";

import React from "react";
import { mount } from "enzyme";

import {
  INITIALIZE_QB,
  TOGGLE_DATA_REFERENCE,
} from "metabase/query_builder/actions";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import * as Urls from "metabase/lib/urls";

// Currently a lot of duplication with FieldPane tests
describe("FieldPane", () => {
  let store = null;
  let queryBuilder = null;

  beforeAll(async () => {
    useSharedAdminLogin();
    store = await createTestStore();

    store.pushPath(Urls.plainQuestion());
    queryBuilder = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB]);
  });

  // NOTE: These test cases are intentionally stateful
  // (doing the whole app rendering thing in every single test case would probably slow things down)

  it("opens properly from QB", async () => {
    // open data reference sidebar by clicking button
    click(queryBuilder.find(".Icon-reference"));
    await store.waitForActions([TOGGLE_DATA_REFERENCE]);

    const dataReference = queryBuilder.find(DataReference);
    expect(dataReference.length).toBe(1);
  });
});
