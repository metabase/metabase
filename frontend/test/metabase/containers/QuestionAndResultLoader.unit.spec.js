import React from "react";
import { shallow } from "enzyme";

import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";

describe("QuestionAndResultLoader", () => {
  it("should load a question and a result", () => {
    shallow(<QuestionAndResultLoader>{() => <div />}</QuestionAndResultLoader>);
  });
});
