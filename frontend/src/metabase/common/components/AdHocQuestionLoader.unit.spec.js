import { render } from "__support__/ui";
import { delay } from "__support__/utils";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, createQuery } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import { AdHocQuestionLoader } from "./AdHocQuestionLoader";

describe("AdHocQuestionLoader", () => {
  let loadQuestionSpy, loadMetadataSpy, mockChild;

  beforeEach(() => {
    // reset mocks between tests so we have fresh spies, etc
    jest.resetAllMocks();
    mockChild = jest.fn().mockReturnValue(<div />);
    loadMetadataSpy = jest.fn();
    loadQuestionSpy = jest.spyOn(
      AdHocQuestionLoader.prototype,
      "_loadQuestion",
    );
  });

  it("should load a question given a questionHash", async () => {
    const q = Question.create({ metadata: SAMPLE_METADATA }).setQuery(
      createQuery(),
    );
    const questionHash = ML_Urls.getUrl(q).match(/(#.*)/)[1];

    render(
      <AdHocQuestionLoader
        questionHash={questionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoader>,
    );
    expect(mockChild.mock.calls[0][0].loading).toEqual(true);
    expect(mockChild.mock.calls[0][0].error).toEqual(null);

    // stuff happens asynchronously
    await delay(0);

    const calls = mockChild.mock.calls;
    const { question, loading, error } = calls[calls.length - 1][0];
    expect(
      Lib.areLegacyQueriesEqual(question.datasetQuery(), q.datasetQuery()),
    ).toBe(true);
    expect(loading).toEqual(false);
    expect(error).toEqual(null);
  });

  it("should load a new question if the question hash changes", () => {
    // create some junk strings, real question hashes are more ludicrous but this
    // is easier to verify
    const originalQuestionHash = "#abc123";
    const newQuestionHash = "#def456";

    const { rerender } = render(
      <AdHocQuestionLoader
        questionHash={originalQuestionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoader>,
    );

    expect(loadQuestionSpy).toHaveBeenCalledWith(originalQuestionHash);

    // update the question hash, a new location.hash in the url would most
    // likely do this
    rerender(
      <AdHocQuestionLoader
        questionHash={newQuestionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoader>,
    );

    // question loading should begin with the new ID
    expect(loadQuestionSpy).toHaveBeenCalledWith(newQuestionHash);

    expect(mockChild).toHaveBeenCalled();
  });
});
