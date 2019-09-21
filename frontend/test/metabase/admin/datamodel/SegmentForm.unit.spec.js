import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, cleanup } from "@testing-library/react";

import { getStore } from "metabase/store";
import normalReducers from "metabase/reducers-main";

import SegmentForm from "metabase/admin/datamodel/containers/SegmentForm";

function renderForm(props) {
  const store = getStore(normalReducers);
  return render(
    <SegmentForm
      store={store}
      table={{ aggregation_options: [] }}
      {...props}
    />,
  );
}

describe("SegmentForm", () => {
  afterEach(cleanup);

  it("should render creation UI", () => {
    const { getByText, queryByText } = renderForm();
    getByText("Create Your Segment");
    getByText(/^Select and add filters to create your new segment/);
    expect(queryByText("Reason For Changes")).toBe(null);
    getByText("Save changes");
  });

  it("should render UI for existing segments", () => {
    const segment = { id: 123 };
    const { getByText } = renderForm({ segment });
    getByText("Edit Your Segment");
    getByText(/^Make changes to your segment/);
    getByText("Reason For Changes");
    getByText("Save changes");
  });
});
