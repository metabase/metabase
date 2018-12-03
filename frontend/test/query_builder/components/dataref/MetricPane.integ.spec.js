import {
  useSharedAdminLogin,
  createTestStore,
  cleanup,
} from "__support__/integrated_tests";
import { click } from "__support__/enzyme_utils";

import React from "react";
import { mount } from "enzyme";

import {
  INITIALIZE_QB,
  QUERY_COMPLETED,
  TOGGLE_DATA_REFERENCE,
} from "metabase/query_builder/actions";
import { delay } from "metabase/lib/promise";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { vendor_count_metric } from "__support__/sample_dataset_fixture";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";
import QueryDefinition from "metabase/query_builder/components/dataref/QueryDefinition";
import QueryButton from "metabase/components/QueryButton";
import Scalar from "metabase/visualizations/visualizations/Scalar";
import * as Urls from "metabase/lib/urls";
import { MetricApi } from "metabase/services";

describe("MetricPane", () => {
  let store = null;
  let queryBuilder = null;

  beforeAll(async () => {
    useSharedAdminLogin();
    cleanup.metric(await MetricApi.create(vendor_count_metric));
    store = await createTestStore();

    store.pushPath(Urls.plainQuestion());
    queryBuilder = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB]);
  });

  afterAll(cleanup);

  // NOTE: These test cases are intentionally stateful
  // (doing the whole app rendering thing in every single test case would probably slow things down)

  it("opens properly from QB", async () => {
    // open data reference sidebar by clicking button
    click(queryBuilder.find(".Icon-reference"));
    await store.waitForActions([TOGGLE_DATA_REFERENCE]);

    const dataReference = queryBuilder.find(DataReference);
    expect(dataReference.length).toBe(1);

    click(dataReference.find('a[children="Products"]'));

    // TODO: Refactor TablePane so that it uses redux/metadata actions instead of doing inlined API calls
    // then we can replace this with `store.waitForActions([FETCH_TABLE_FOREIGN_KEYS])` or similar
    await delay(3000);

    click(
      dataReference.find(`a[children="${vendor_count_metric.name}"]`).first(),
    );

    await store.waitForActions([FETCH_TABLE_METADATA]);
  });

  it("shows you the correct definition", () => {
    const queryDefinition = queryBuilder
      .find(DataReference)
      .find(QueryDefinition);
    expect(queryDefinition.text()).toMatch(/Number of distinct valuesofVendor/);
  });

  it("lets you see the vendor count", async () => {
    const queryButton = queryBuilder.find(DataReference).find(QueryButton);

    try {
      click(queryButton.children().first());
    } catch (e) {
      // QueryButton uses react-router Link which always throws an error if it's called without a parent Router object
      // Now we are just using the onClick handler of Link so we don't have to care about that
    }

    await store.waitForActions([QUERY_COMPLETED]);

    expect(queryBuilder.find(Scalar).text()).toBe("200");
  });
});
