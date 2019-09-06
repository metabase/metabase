import React from "react";
import { mount } from "enzyme";

import DatabaseDetailsForm from "metabase/components/DatabaseDetailsForm";

const ENGINES = {
  h2: {
    "details-fields": [
      {
        name: "db",
        "display-name": "Connection String",
        placeholder: "file:/Users/camsaul/bird_sightings/toucans",
        required: true,
      },
    ],
    "driver-name": "H2",
  },
};

const DEFAULT_PROPS = {
  details: {},
  engines: ENGINES,
  engine: Object.keys(ENGINES)[0],
  submitButtonText: "Next",
  submitFn: () => undefined,
};

describe("DatabaseDetailsForm", () => {
  it("should render", () => {
    mount(<DatabaseDetailsForm {...DEFAULT_PROPS} />);
  });

  it("should render field errors", () => {
    const wrapper = mount(
      <DatabaseDetailsForm
        {...DEFAULT_PROPS}
        formError={{ data: { errors: { db: "fix this field" } } }}
      />,
    );
    const labels = wrapper.find(".Form-label").map(e => e.text());
    expect(labels).toContain("Connection String : fix this field");
  });

  it("should render field errors as a form message if there's no matching field", () => {
    const wrapper = mount(
      <DatabaseDetailsForm
        {...DEFAULT_PROPS}
        formError={{
          data: { errors: { foobar: "couldn't find a field for this" } },
        }}
      />,
    );
    const message = wrapper.find(".Form-message").text();
    expect(message).toEqual("couldn't find a field for this");
  });
});
