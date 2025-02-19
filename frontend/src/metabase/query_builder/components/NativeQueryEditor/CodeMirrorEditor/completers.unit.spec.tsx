import {
  CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, waitFor } from "__support__/ui";
import { isNotNull } from "metabase/lib/types";
import type {
  AutocompleteMatchStyle,
  AutocompleteSuggestion,
  Card,
  CardAutocompleteSuggestion,
  NativeQuerySnippet,
} from "metabase-types/api";
import { createMockCard, createMockField } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import {
  useCardTagCompletion,
  useKeywordsCompletion,
  useLocalsCompletion,
  useReferencedCardCompletion,
  useSchemaCompletion,
  useSnippetCompletion,
} from "./completers";

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

describe("useCardTagCompletion", () => {
  const DATABASE_ID = 1;
  const MOCK_RESULTS: Partial<CardAutocompleteSuggestion>[] = [
    {
      id: 51,
      name: "Foo Bar",
      type: "question",
      collection_name: "Custom collection",
    },
    {
      id: 42,
      name: "Bar Baz",
      type: "metric",
      collection_name: "Custom collection",
    },
  ];

  function setup({
    databaseId = DATABASE_ID,
    results = MOCK_RESULTS,
  }: {
    databaseId?: number;
    results?: Partial<CardAutocompleteSuggestion>[];
  } = {}) {
    const url = `path:/api/database/${databaseId}/card_autocomplete_suggestions`;
    fetchMock.get(url, results);

    const complete = completer(() => useCardTagCompletion({ databaseId }));

    return { complete, url };
  }

  it("should not call card completion endpoint when not in a card tag", async () => {
    const queries = [
      // none of these should trigger a call
      "SELECT Fo|",
      "SELECT {{ snippet: Fo|",
      "SELECT {{ snippet: Fo| }}",
      "SELECT {{ Fo|",
      "SELECT {{ Fo| }}",
    ];
    const { complete, url } = setup();

    for (const query of queries) {
      const result = await complete(query);
      expect(result).toBe(null);
    }

    expect(fetchMock.calls(url)).toHaveLength(0);
  });

  it("should autocomplete cards when inside an open card tag", async () => {
    const { complete, url } = setup();
    const results = await complete("SELECT {{ #bar|");

    expect(results).toEqual({
      from: 10,
      to: 14,
      validFor: expect.any(Function),
      options: [
        {
          label: "#51-foo-bar",
          apply: "#51-foo-bar }}",
          detail: "Question in Custom collection",
        },
        {
          label: "#42-bar-baz",
          apply: "#42-bar-baz }}",
          detail: "Metric in Custom collection",
        },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });

  it("should autocomplete cards when inside an open card tag, inside a word", async () => {
    const { complete, url } = setup();
    const results = await complete("SELECT {{ #ba|r");

    expect(results).toEqual({
      from: 10,
      to: 14,
      validFor: expect.any(Function),
      options: [
        {
          label: "#51-foo-bar",
          apply: "#51-foo-bar }}",
          detail: "Question in Custom collection",
        },
        {
          label: "#42-bar-baz",
          apply: "#42-bar-baz }}",
          detail: "Metric in Custom collection",
        },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });

  it("should autocomplete cards when inside a closed card tag", async () => {
    const { complete, url } = setup();
    const results = await complete("SELECT {{ #bar| }}");

    expect(results).toEqual({
      from: 10,
      to: 14,
      validFor: expect.any(Function),
      options: [
        {
          label: "#51-foo-bar",
          apply: "#51-foo-bar",
          detail: "Question in Custom collection",
        },
        {
          label: "#42-bar-baz",
          apply: "#42-bar-baz",
          detail: "Metric in Custom collection",
        },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });

  it("should autocomplete cards when inside a closed card tag, inside a word", async () => {
    const { complete, url } = setup();
    const results = await complete("SELECT {{ #ba|r }}");

    expect(results).toEqual({
      from: 10,
      to: 14,
      validFor: expect.any(Function),
      options: [
        {
          label: "#51-foo-bar",
          apply: "#51-foo-bar",
          detail: "Question in Custom collection",
        },
        {
          label: "#42-bar-baz",
          apply: "#42-bar-baz",
          detail: "Metric in Custom collection",
        },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });
});

describe("useReferencedCardCompletion", () => {
  const MOCK_RESULTS = [
    createMockCard({
      id: 42,
      name: "Referenced Question",
      result_metadata: [
        createMockField({
          name: "Foobar",
        }),
        createMockField({
          name: "Bar",
        }),
      ],
    }),
  ];

  const url = /\/api\/card\/\d+$/;

  function setup({
    results = MOCK_RESULTS,
    cardIds = results.map(card => card.id).filter(isNotNull),
  }: {
    results?: Partial<Card>[];
    cardIds?: number[];
  } = {}) {
    for (const id of cardIds) {
      const url = `path:/api/card/${id}`;
      const card = results.find(card => card.id === id);
      fetchMock.get(url, {
        status: 200,
        body: card,
      });
    }

    const complete = completer(() =>
      useReferencedCardCompletion({ referencedCardIds: cardIds }),
    );

    return { complete, url };
  }

  it("should not be triggered inside of tags or snippets", async () => {
    const queries = [
      // none of these should trigger a call
      "SELECT {{ #foo|",
      "SELECT {{ #foo| }}",
      "SELECT {{ snippet: Fo|",
      "SELECT {{ snippet: Fo| }}",
      "SELECT {{ Fo|",
      "SELECT {{ Fo| }}",
    ];
    const { complete } = setup();

    for (const query of queries) {
      const result = await complete(query);
      expect(result).toBe(null);
    }

    expect(fetchMock.calls("/api/card/*")).toHaveLength(0);
  });

  it("should return columns from referenced cards", async () => {
    const { complete } = setup();
    const results = await complete("SELECT Ba|");
    expect(results).toEqual({
      from: 7,
      validFor: expect.any(Function),
      options: [
        { label: "Foobar", detail: "Referenced Question :type/Text" },
        { label: "Bar", detail: "Referenced Question :type/Text" },
      ],
    });

    expect(fetchMock.calls(url)).toHaveLength(1);
  });

  it("should return columns from referenced cards, inside word", async () => {
    const { complete } = setup();
    const results = await complete("SELECT Ba|r");
    expect(results).toEqual({
      from: 7,
      to: 10,
      validFor: expect.any(Function),
      options: [
        { label: "Foobar", detail: "Referenced Question :type/Text" },
        { label: "Bar", detail: "Referenced Question :type/Text" },
      ],
    });
    expect(fetchMock.calls(url)).toHaveLength(1);
  });
});

describe("useLocalsCompletion", () => {
  function setup({ engine = "h2" }: { engine?: string | null } = {}) {
    const complete = completer(() => useLocalsCompletion({ engine }));
    return { complete };
  }

  it("should complete locals from a sql query", async () => {
    const { complete } = setup({ engine: "postgres" });
    const results = await complete("SELECT Foo as Bar FROM Baz SORT BY ba|");
    expect(results).toEqual({
      from: 35,
      to: undefined,
      options: [
        {
          label: "Bar",
          detail: "local",
        },
        {
          label: "Baz",
          detail: "local",
        },
      ],
    });
  });

  it("should complete locals from a sql query, inside a word", async () => {
    const { complete } = setup({ engine: "postgres" });
    const results = await complete("SELECT Foo as Bar FROM Baz SORT BY b|a");
    expect(results).toEqual({
      from: 35,
      to: 37,
      options: [
        {
          label: "Bar",
          detail: "local",
        },
        {
          label: "Baz",
          detail: "local",
        },
      ],
    });
  });

  it("should not complete locals that come from the dialect", async () => {
    const { complete } = setup({ engine: "postgres" });
    const results = await complete(
      "SELECT count(Foo) as Bar FROM Baz SORT BY co|",
    );
    // do not complete "count"
    expect(results).toBe(null);
  });

  it("should not complete quoted locals that come from the dialect", async () => {
    const { complete } = setup({ engine: "postgres" });
    const results = await complete(
      `SELECT foo as "QUOTED_local" FROM bar WHERE QUO|`,
    );
    expect(results).toEqual({
      from: 44,
      options: [
        {
          label: "QUOTED_local",
          detail: "local",
        },
      ],
    });
  });

  it("should not complete locals in a non-sql query", async () => {
    const { complete } = setup({ engine: "mongo" });
    const results = await complete("{|}");
    expect(results).toBe(null);
  });
});

describe("useKeywordsCompletion", () => {
  function setup({
    engine = "sql",
  }: {
    engine?: string;
  } = {}) {
    const complete = completer(() => useKeywordsCompletion({ engine }));
    return { complete };
  }

  describe("sql", () => {
    it("should complete sql keywords", async () => {
      const { complete } = setup({ engine: "sql" });
      const results = await complete("SEL|");
      expect(results).toEqual({
        from: 0,
        to: undefined,
        options: [
          {
            detail: "keyword",
            label: "SELECT",
          },
        ],
      });
    });

    it("should complete sql keywords, inside a word", async () => {
      const { complete } = setup({ engine: "sql" });
      const results = await complete("SEL|E");
      expect(results).toEqual({
        from: 0,
        to: 4,
        options: [
          {
            detail: "keyword",
            label: "SELECT",
          },
        ],
      });
    });

    it("should not complete keywords inside of tags or snippets", async () => {
      const queries = [
        // none of these should trigger a call
        "SELECT {{ #foo|",
        "SELECT {{ #foo| }}",
        "SELECT {{ snippet: Fo|",
        "SELECT {{ snippet: Fo| }}",
        "SELECT {{ Fo|",
        "SELECT {{ Fo| }}",
      ];
      const { complete } = setup();

      for (const query of queries) {
        const result = await complete(query);
        expect(result).toBe(null);
      }
    });
  });

  describe("mongo", () => {
    it("should complete mongo keywords", async () => {
      const { complete } = setup({ engine: "mongo" });
      const results = await complete(`{ "$filt|`);
      expect(results).toEqual({
        from: 3,
        to: undefined,
        options: [
          {
            detail: "keyword",
            label: "$filter",
          },
        ],
      });
    });

    it("should complete mongo keywords, inside word", async () => {
      const { complete } = setup({ engine: "mongo" });
      const results = await complete(`{ "$fil|t`);
      expect(results).toEqual({
        from: 3,
        to: 8,
        options: [
          {
            detail: "keyword",
            label: "$fill",
          },
          {
            detail: "keyword",
            label: "$filter",
          },
        ],
      });
    });

    it("should not complete keywords inside of tags or snippets", async () => {
      const queries = [
        // none of these should trigger a call
        `{ "$filter": {{ #$fil|`,
        `{ "$filter": {{ #$fil| }}`,
        `{ "$filter": {{ snippet: $fil|`,
        `{ "$filter": {{ snippet: $fil| }}`,
        `{ "$filter": {{ $fil|`,
        `{ "$filter": {{ $fil| }}`,
      ];
      const { complete } = setup();

      for (const query of queries) {
        const result = await complete(query);
        expect(result).toBe(null);
      }
    });
  });
});
