import React from "react";
import { render, cleanup } from "@testing-library/react";
import "jest-dom/extend-expect";

import { getStore } from "metabase/store";
import normalReducers from "metabase/reducers-main";

import MetricForm from "metabase/admin/datamodel/containers/MetricForm";

function renderForm(props) {
  const store = getStore(normalReducers);
  return render(
    <MetricForm store={store} table={{ aggregation_options: [] }} {...props} />,
  );
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
});
