import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, cleanup } from "@testing-library/react";

import { getStore } from "metabase/store";
import normalReducers from "metabase/reducers-main";

import MetricForm from "metabase/admin/datamodel/containers/MetricForm";

import { metadata } from "__support__/sample_dataset_fixture";

function renderForm(props) {
  const store = getStore(normalReducers);
  const [table] = metadata.tablesList();
  return render(<MetricForm store={store} table={table} {...props} />);
}

describe("MetricForm", () => {
  afterEach(cleanup);

  it("should render creation UI", () => {
    const { getByText, queryByText } = renderForm();
    getByText("Create Your Metric");
    getByText(/^You can create saved metrics/);
    expect(queryByText("Reason For Changes")).toBe(null);
    getByText("Save changes");
  });

  it("should render UI for existing metrics", () => {
    const metric = { id: 123 };
    const { getByText } = renderForm({ metric });
    getByText("Edit Your Metric");
    getByText(/^Make changes to your metric/);
    getByText("Reason For Changes");
    getByText("Save changes");
  });

  it("should render count as the default aggregation", () => {
    const updatePreviewSummary = jest.fn();
    const { getByText } = renderForm({ metadata, updatePreviewSummary });
    getByText("Count of rows");
    const [{ query }] = updatePreviewSummary.mock.calls[1];
    expect(query.aggregation).toEqual([["count"]]);
  });
});
