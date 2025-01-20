import {
  CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, waitFor } from "__support__/ui";
import type {
  AutocompleteMatchStyle,
  AutocompleteSuggestion,
  NativeQuerySnippet,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { useSchemaCompletion, useSnippetCompletion } from "./completers";

function completer(
  useCompletion: () => CompletionSource,
  state?: Partial<State>,
) {
  let completer: CompletionSource | null = null;

  function Wrapper() {
    completer = useCompletion();
    return null;
  }

  renderWithProviders(<Wrapper />, {
    storeInitialState: state,
  });

  return (doc: string) =>
    act(function () {
      if (!completer) {
        return null;
      }

      const cur = doc.indexOf("|");
      if (cur === -1) {
        throw new Error("Please use | to indicate the position of the cursor");
      }

      doc = doc.slice(0, cur) + doc.slice(cur + 1);

      const state = EditorState.create({
        doc,
        selection: { anchor: cur },
      });

      const ctx = new CompletionContext(state, cur, false);
      return completer(ctx);
    });
}

describe("useSchemaCompletion", () => {
  const DATABASE_ID = 1;
  const MOCK_RESULTS: AutocompleteSuggestion[] = [
    ["SEATS", "ACCOUNTS :type/Integer"],
    ["SOURCE", "PEOPLE :type/Text :type/State"],
  ];

  function setup({
    databaseId = DATABASE_ID,
    matchStyle = "prefix",
    results = MOCK_RESULTS,
  }: {
    databaseId?: number;
    matchStyle?: AutocompleteMatchStyle;
    results?: AutocompleteSuggestion[];
  }) {
    const state = createMockState({
      settings: mockSettings({
        "native-query-autocomplete-match-style": matchStyle,
      }),
    });

    const url = `path:/api/database/${databaseId}/autocomplete_suggestions`;
    fetchMock.get(url, results);

    const complete = completer(
      () => useSchemaCompletion({ databaseId: DATABASE_ID }),
      state,
    );

    return { complete, url };
  }

  it("should not call the endpoint if the cursor is inside an open tag", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });

    const results = await complete("SELECT {{ foo|");
    expect(results).toBe(null);
    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should not call the endpoint if the cursor is inside a closed tag", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });
    const results = await complete("SELECT {{ foo| }}");
    expect(results).toBe(null);
    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should not call the endpoint if the cursor is inside an open snippet tag", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });
    const results = await complete("SELECT {{ snippet: foo|");

    expect(results).toBe(null);
    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should not call the endpoint if the cursor is inside a closed snippet tag", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });
    const results = await complete("SELECT {{ snippet: foo| }}");

    expect(results).toBe(null);
    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should not call the endpoint if the cursor is inside an open card tag", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });
    const results = await complete("SELECT {{ #foo|");

    expect(results).toBe(null);
    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should not call the endpoint if the cursor is inside a closed card tag", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });
    const results = await complete("SELECT {{ #foo| }}");

    expect(results).toBe(null);
    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should complete even when inside a word", async () => {
    const { complete, url } = setup({ matchStyle: "prefix" });
    const results = await complete("AAA\nSELECT S|EA");

    expect(results).toEqual({
      from: 11,
      to: 14,
      validFor: expect.any(Function),
      options: [
        {
          label: "SEATS",
          detail: "ACCOUNTS :type/Integer",
        },
        {
          label: "SOURCE",
          detail: "PEOPLE :type/Text :type/State",
        },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });

  it("should deduplicate results", async () => {
    const { complete, url } = setup({
      matchStyle: "prefix",
      results: [
        ["SOURCE", "ACCOUNTS :type/String"],
        ["SOURCE", "ANALYTICS :type/Integer"],
      ],
    });
    const results = await complete("SELECT S|");

    expect(results).toEqual({
      from: 7,
      validFor: expect.any(Function),
      options: [
        {
          detail: "ACCOUNTS :type/String",
          label: "SOURCE",
        },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });

  describe("native-query-autocomplete-match-style = off", () => {
    const matchStyle = "off";

    it("should not call the endpoint", async () => {
      const { complete, url } = setup({ matchStyle });
      const result = await complete("SELECT S|");

      expect(result).toEqual(null);
      expect(fetchMock.calls(url)).toHaveLength(0);
    });
  });

  describe("native-query-autocomplete-match-style = prefix", () => {
    const matchStyle = "prefix";

    it("should call the endpoint with the current word", async () => {
      const { complete, url } = setup({ matchStyle });
      const result = await complete("SELECT S|");

      const calls = fetchMock.calls(url);
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0][0]).searchParams.get("prefix")).toBe("S");

      expect(result).toEqual({
        from: 7,
        validFor: expect.any(Function),
        options: [
          {
            label: "SEATS",
            detail: "ACCOUNTS :type/Integer",
          },
          {
            label: "SOURCE",
            detail: "PEOPLE :type/Text :type/State",
          },
        ],
      });
    });
  });

  describe("native-query-autocomplete-match-style = substring", () => {
    const matchStyle = "substring";

    it("should call the endpoint with the current word", async () => {
      const { complete, url } = setup({ matchStyle });
      const result = await complete("SELECT S|");

      const calls = fetchMock.calls(url);

      expect(calls).toHaveLength(1);
      expect(new URL(calls[0][0]).searchParams.get("substring")).toBe("S");

      expect(result).toEqual({
        from: 7,
        validFor: expect.any(Function),
        options: [
          {
            label: "SEATS",
            detail: "ACCOUNTS :type/Integer",
          },
          {
            label: "SOURCE",
            detail: "PEOPLE :type/Text :type/State",
          },
        ],
      });
    });
  });
});

describe("useSnippetCompletion", () => {
  const MOCK_RESULTS: Partial<NativeQuerySnippet>[] = [
    { name: "Foobar" },
    {
      name: "Barbaz",
    },
  ];

  const url = "path:/api/native-query-snippet";

  function setup({
    results = MOCK_RESULTS,
  }: {
    results?: Partial<NativeQuerySnippet>[];
  } = {}) {
    fetchMock.get(url, results);

    const complete = completer(() => useSnippetCompletion());

    // the call gets made once before completing so it's always made
    expect(fetchMock.calls(url)).toHaveLength(1);

    return { complete };
  }

  it("should not return snippet completions when not in a tag", async () => {
    const { complete } = setup();
    const results = await complete("SELECT S|");
    expect(results).toBe(null);
  });

  it("should not return snippet completions when in a parameter tag", async () => {
    const { complete } = setup();
    const results = await complete("SELECT {{ foo| }}");
    expect(results).toBe(null);
  });

  it("should not return snippet completions when in a card tag", async () => {
    const { complete } = setup();
    const results = await complete("SELECT {{ #foo| }}");
    expect(results).toBe(null);
  });

  it("should return snippet completions when in an open snippet tag", async () => {
    const { complete } = setup();

    await waitFor(async () => {
      const results = await complete("{{ snippet: fo| ");
      expect(results).toEqual({
        from: 12,
        to: 14,
        options: [
          {
            label: "Foobar",
            apply: "Foobar }}",
            detail: "Snippet",
          },
        ],
      });
    });
  });

  it("should return snippet completions when in an open snippet tag, inside a word", async () => {
    const { complete } = setup();

    await waitFor(async () => {
      const results = await complete("{{ snippet: fo|o ");
      expect(results).toEqual({
        from: 12,
        to: 15,
        options: [
          {
            label: "Foobar",
            apply: "Foobar }}",
            detail: "Snippet",
          },
        ],
      });
    });
  });

  it("should return snippet completions when in a closed snippet tag", async () => {
    const { complete } = setup();

    await waitFor(async () => {
      const results = await complete("{{ snippet: fo| }}");
      expect(results).toEqual({
        from: 12,
        to: 14,
        options: [
          {
            label: "Foobar",
            apply: "Foobar",
            detail: "Snippet",
          },
        ],
      });
    });
  });

  it("should return snippet completions when in a closed snippet tag, inside a word", async () => {
    const { complete } = setup();

    await waitFor(async () => {
      const results = await complete("{{ snippet: fo|o }}");
      expect(results).toEqual({
        from: 12,
        to: 15,
        options: [
          {
            label: "Foobar",
            apply: "Foobar",
            detail: "Snippet",
          },
        ],
      });
    });
  });
});
