import { utf8_to_b64url } from "metabase/utils/encoding";

import { getQueryBuilderSkeletonLayout } from "./QueryBuilderSkeleton";

const toHash = (card: Record<string, unknown>) =>
  `#${utf8_to_b64url(JSON.stringify(card))}`;

interface SetupOpts {
  pathname?: string;
  hash?: string;
  isTableRoute?: boolean;
  isSavedCard?: boolean;
  savedCardDisplay?: string;
}

const getLayout = ({
  pathname = "/question",
  hash = "",
  isTableRoute = false,
  isSavedCard = false,
  savedCardDisplay,
}: SetupOpts) =>
  getQueryBuilderSkeletonLayout({
    pathname,
    hash,
    isTableRoute,
    isSavedCard,
    savedCardDisplay,
  });

describe("getQueryBuilderSkeletonLayout", () => {
  it("draws a saved question with its chart type once the card is cached", () => {
    expect(
      getLayout({
        pathname: "/question/1-orders",
        isSavedCard: true,
        savedCardDisplay: "line",
      }),
    ).toEqual({ type: "visualization", display: "line" });
  });

  it("leaves the chart out of a saved question whose card isn't loaded yet", () => {
    expect(
      getLayout({ pathname: "/question/1-orders", isSavedCard: true }),
    ).toEqual({ type: "visualization", display: undefined });
  });

  it("draws the SQL editor for an unsaved legacy native query", () => {
    const hash = toHash({
      display: "table",
      dataset_query: { type: "native", database: 1, native: { query: "" } },
    });

    expect(getLayout({ hash })).toEqual({ type: "native-editor" });
  });

  it("draws the SQL editor for an unsaved MBQL 5 native query", () => {
    const hash = toHash({
      display: "table",
      dataset_query: {
        "lib/type": "mbql/query",
        database: 1,
        stages: [{ "lib/type": "mbql.stage/native", native: "" }],
      },
    });

    expect(getLayout({ hash })).toEqual({ type: "native-editor" });
  });

  it("draws an ad-hoc GUI question with the chart type from the URL", () => {
    const hash = toHash({
      display: "bar",
      dataset_query: {
        "lib/type": "mbql/query",
        database: 1,
        stages: [{ "lib/type": "mbql.stage/mbql", "source-table": 2 }],
      },
    });

    expect(getLayout({ hash })).toEqual({
      type: "visualization",
      display: "bar",
    });
  });

  it("draws the notebook in notebook mode", () => {
    const hash = toHash({ display: "table", dataset_query: {} });

    expect(getLayout({ pathname: "/question/notebook", hash })).toEqual({
      type: "notebook",
    });
  });

  it("draws a table for table routes", () => {
    expect(getLayout({ pathname: "/table/2", isTableRoute: true })).toEqual({
      type: "visualization",
      display: "table",
    });
    expect(getLayout({ hash: "#?db=1&table=2" })).toEqual({
      type: "visualization",
      display: "table",
    });
  });

  it("leaves the chart out when the URL can't be parsed", () => {
    expect(getLayout({ hash: "#not-a-card" })).toEqual({
      type: "visualization",
      display: undefined,
    });
  });
});
