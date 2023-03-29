import _ from "underscore";
import {
  createMockCard,
  createMockDataset,
  createMockVisualizationSettings,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import MetabaseSettings from "metabase/lib/settings";
import { getDownloadButtonParams } from "./utils";

const type = "csv";
const params = { id: 1 };
const card = createMockCard();
const visualizationSettings = createMockVisualizationSettings();
const result = createMockDataset({
  json_query: {
    ...createMockStructuredDatasetQuery(),
    parameters: [],
  },
});
const uuid = "uuid";
const token = "token";
const dashcardId = 10;
const dashboardId = 100;

describe("getDownloadButtonParams", () => {
  let siteUrl: any;

  beforeEach(() => {
    siteUrl = MetabaseSettings.get("site-url");
    MetabaseSettings.set("site-url", "http://metabase.com");
  });

  afterEach(() => {
    MetabaseSettings.set("site-url", siteUrl);
  });

  it("returns params for a embedding on an embedded dashboard", () => {
    expect(
      getDownloadButtonParams({
        params,
        type,
        card,
        dashcardId,
        dashboardId,
        token,
      }),
    ).toStrictEqual({
      method: "GET",
      params: {
        id: 1,
      },
      url: "api/embed/dashboard/token/dashcard/10/card/1/csv",
    });
  });

  it("returns params for a dashcard", () => {
    expect(
      getDownloadButtonParams({
        params,
        type,
        card,
        dashcardId,
        dashboardId,
        result,
      }),
    ).toStrictEqual({
      method: "POST",
      params: { parameters: "[]" },
      url: "api/dashboard/100/dashcard/10/card/1/query/csv",
    });
  });

  it("returns params for a public question", () => {
    expect(
      getDownloadButtonParams({
        params,
        type,
        card,
        uuid,
        result,
      }),
    ).toStrictEqual({
      method: "GET",
      params: { parameters: "[]" },
      url: "http://metabase.com/public/question/uuid.csv",
    });
  });

  it("returns params for an embedded question", () => {
    expect(
      getDownloadButtonParams({
        params,
        type,
        token,
        card,
      }),
    ).toStrictEqual({
      method: "GET",
      params: null,
      url: "http://metabase.com/embed/question/token.csv",
    });
  });

  it("returns params for a saved question", () => {
    expect(
      getDownloadButtonParams({
        params,
        type,
        card,
        result,
      }),
    ).toStrictEqual({
      method: "POST",
      params: { parameters: "[]" },
      url: "api/card/1/query/csv",
    });
  });

  it("returns params for an unsaved question", () => {
    expect(
      getDownloadButtonParams({
        params,
        type,
        visualizationSettings,
        card: _.omit(card, "id"),
        result,
      }),
    ).toStrictEqual({
      method: "POST",
      url: "api/dataset/csv",
      params: {
        query: JSON.stringify(result.json_query),
        visualization_settings: "{}",
      },
    });
  });
});
