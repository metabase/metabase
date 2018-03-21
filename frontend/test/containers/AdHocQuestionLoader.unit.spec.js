import React from "react";
import { shallow } from "enzyme";

// import the un-connected component so we can test its internal logic sans
// redux
import { AdHocQuestionLoader } from "metabase/containers/AdHocQuestionLoader";

describe("AdHocQuestionLoader", () => {
  beforeEach(() => {
    // reset mocks between tests so we have fresh spies, etc
    jest.resetAllMocks();
  });

  it("should load a question given a questionHash", () => {
    const questionHash = "#abc123";

    const loadSpy = jest.spyOn(AdHocQuestionLoader.prototype, "_loadQuestion");

    shallow(
      <AdHocQuestionLoader questionHash={questionHash}>
        {() => <div />}
      </AdHocQuestionLoader>,
    );

    expect(loadSpy).toHaveBeenCalledWith(questionHash);
  });

  it("should load a new question if the question hash changes", () => {
    // create some junk strigs, real question hashes are more ludicrous but this
    // is easier to verify
    const originalQuestionHash = "#abc123";
    const newQuestionHash = "#def456";

    const loadSpy = jest.spyOn(AdHocQuestionLoader.prototype, "_loadQuestion");

    const mockChild = jest.fn().mockReturnValue(<div />)

    const wrapper = shallow(
      <AdHocQuestionLoader questionHash={originalQuestionHash} children={mockChild} />
    );

    expect(loadSpy).toHaveBeenCalledWith(originalQuestionHash);

    // update the question hash, a new location.hash in the url would most
    // likely do this
    wrapper.setProps({ questionHash: newQuestionHash });

    // question loading should begin with the new ID
    expect(loadSpy).toHaveBeenCalledWith(newQuestionHash);

    expect(mockChild).toHaveBeenCalled()
  });
});
