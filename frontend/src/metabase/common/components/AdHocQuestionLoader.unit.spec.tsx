import { render } from "__support__/ui";
import { delay } from "__support__/utils";
import * as Card from "metabase/lib/card";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, createQuery } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import { AdHocQuestionLoaderView } from "./AdHocQuestionLoader";

describe("AdHocQuestionLoader", () => {
  let loadMetadataSpy: jest.Mock;
  let mockChild: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    mockChild = jest.fn().mockReturnValue(<div />);
    loadMetadataSpy = jest.fn();
  });

  it("should load a question given a questionHash", async () => {
    const q = Question.create({ metadata: SAMPLE_METADATA }).setQuery(
      createQuery(),
    );
    const questionHash = ML_Urls.getUrl(q).match(/(#.*)/)?.[1] ?? "";

    render(
      <AdHocQuestionLoaderView
        questionHash={questionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoaderView>,
    );
    expect(mockChild.mock.calls[0][0].loading).toEqual(true);
    expect(mockChild.mock.calls[0][0].error).toEqual(null);

    await delay(0);

    const calls = mockChild.mock.calls;
    const { question, loading, error } = calls[calls.length - 1][0];
    expect(
      Lib.areLegacyQueriesEqual(question.datasetQuery(), q.datasetQuery()),
    ).toBe(true);
    expect(loading).toEqual(false);
    expect(error).toEqual(null);
  });

  it("should call loadMetadataForCard when question hash changes", async () => {
    const q = Question.create({ metadata: SAMPLE_METADATA }).setQuery(
      createQuery(),
    );
    const questionHash = ML_Urls.getUrl(q).match(/(#.*)/)?.[1] ?? "";

    // Create a different valid question with a different limit
    const q2 = Question.create({ metadata: SAMPLE_METADATA })
      .setQuery(createQuery())
      .updateSettings({ "table.pivot": true });
    const newQuestionHash = ML_Urls.getUrl(q2).match(/(#.*)/)?.[1] ?? "";

    const deserializeCardSpy = jest.spyOn(Card, "deserializeCardFromUrl");

    const { rerender } = render(
      <AdHocQuestionLoaderView
        questionHash={questionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoaderView>,
    );

    // Initial load
    await delay(0);
    expect(loadMetadataSpy).toHaveBeenCalledTimes(1);
    expect(deserializeCardSpy).toHaveBeenCalledWith(questionHash);

    // Rerender with different hash
    rerender(
      <AdHocQuestionLoaderView
        questionHash={newQuestionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoaderView>,
    );

    await delay(0);

    // Should have called loadMetadataForCard again with the new card
    expect(loadMetadataSpy).toHaveBeenCalledTimes(2);
    expect(deserializeCardSpy).toHaveBeenCalledWith(newQuestionHash);
  });

  it("should show loading state while question is being loaded", async () => {
    const q = Question.create({ metadata: SAMPLE_METADATA }).setQuery(
      createQuery(),
    );
    const questionHash = ML_Urls.getUrl(q).match(/(#.*)/)?.[1] ?? "";

    // Make loadMetadataForCard hang so we can observe loading state
    let resolveLoad: () => void;
    loadMetadataSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    render(
      <AdHocQuestionLoaderView
        questionHash={questionHash}
        loadMetadataForCard={loadMetadataSpy}
      >
        {mockChild}
      </AdHocQuestionLoaderView>,
    );

    // Initially loading
    expect(mockChild.mock.calls[0][0].loading).toEqual(true);

    await delay(0);

    // Still loading because promise hasn't resolved
    let lastCall = mockChild.mock.calls[mockChild.mock.calls.length - 1][0];
    expect(lastCall.loading).toEqual(true);

    // Resolve the load
    resolveLoad!();
    await delay(0);

    // Now loading should be false
    lastCall = mockChild.mock.calls[mockChild.mock.calls.length - 1][0];
    expect(lastCall.loading).toEqual(false);
  });
});
