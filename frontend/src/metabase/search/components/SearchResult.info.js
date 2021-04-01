import React from "react";
import SearchResult from "./SearchResult";
export const component = SearchResult;
export const category = "search";

export const description = `Displays search results w/ optional context in typeahead and on the search results page`;

const COLLECTION_EXAMPLE = {
  model: "collection",
  id: 1,
  name: "Revenue",
  getIcon: () => "folder",
};

const DASHBOARD_EXAMPLE = {
  model: "dashboard",
  id: 1,
  name: "Revenue overview",
  pinned: true,
  description: "An overview of revenue",
  collection: {
    id: "root",
    name: "Our analytics",
  },
  getIcon: () => "dashboard",
};

const QUESTION_EXAMPLE = {
  model: "card",
  id: 1,
  name: "Revenue by region",
  collection: COLLECTION_EXAMPLE,
  getIcon: () => "table",
};

const LONG_TITLE_DASHBOARD_EXAMPLE = {
  ...DASHBOARD_EXAMPLE,
  name: "Long Verbosington made a very very very long dashboard name",
};

const QUESTION_CONTEXT_EXAMPLE = {
  ...QUESTION_EXAMPLE,
  name: "Poorly named item",
  context: {
    match: "description",
    content: "This is actually about Revenue",
  },
};

export const examples = {
  "": (
    <ol>
      <li>
        <SearchResult result={DASHBOARD_EXAMPLE} />
      </li>
      <li>
        <SearchResult result={QUESTION_EXAMPLE} />
      </li>
      <li>
        <SearchResult result={COLLECTION_EXAMPLE} />
      </li>
    </ol>
  ),
  withContext: (
    <ol>
      <li>
        <SearchResult result={DASHBOARD_EXAMPLE} />
      </li>
      <li>
        <SearchResult result={QUESTION_CONTEXT_EXAMPLE} />
      </li>
      <li>
        <SearchResult result={COLLECTION_EXAMPLE} />
      </li>
      <li>
        <SearchResult result={LONG_TITLE_DASHBOARD_EXAMPLE} />
      </li>
    </ol>
  ),
};
