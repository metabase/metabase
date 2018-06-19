import {
  useSharedAdminLogin,
  createTestStore,
  createSavedQuestion,
  cleanup,
} from "__support__/integrated_tests";
import { click, clickButton, setInputValue } from "__support__/enzyme_utils";

import React from "react";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
  API_CREATE_QUESTION,
  API_UPDATE_QUESTION,
  INITIALIZE_QB,
  QUERY_COMPLETED,
  SET_CARD_VISUALIZATION,
} from "metabase/query_builder/actions";

import Question from "metabase-lib/lib/Question";
import { getCard, getQuestion } from "metabase/query_builder/selectors";
import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import Radio from "metabase/components/Radio";

import * as Urls from "metabase/lib/urls";
import VisualizationSettings from "metabase/query_builder/components/VisualizationSettings";
import Popover from "metabase/components/Popover";

import Collections from "metabase/entities/collections";

const timeBreakoutQuestion = Question.create({
  databaseId: 1,
  tableId: 1,
  metadata: null,
})
  .query()
  .addAggregation(["count"])
  .addBreakout(["datetime-field", ["field-id", 1], "day"])
  .question()
  .setDisplay("line")
  .setDisplayName("Time breakout question");

describe("Query Builder visualization logic", () => {
  let savedTimeBreakoutQuestion = null;
  let app;

  beforeAll(async () => {
    useSharedAdminLogin();
    savedTimeBreakoutQuestion = await createSavedQuestion(timeBreakoutQuestion);
    cleanup.question(savedTimeBreakoutQuestion);
  });

  afterAll(cleanup);

  afterEach(() => {
    if (app) {
      app.unmount();
      app = null;
    }
  });

  it("should save the default x axis and y axis to `visualization_settings` when saving a new question in QB", async () => {
    const store = await createTestStore();
    store.pushPath(timeBreakoutQuestion.getUrl());
    app = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB]);

    expect(getCard(store.getState()).visualization_settings).toEqual({});

    await store.waitForActions([QUERY_COMPLETED]);
    expect(getCard(store.getState()).visualization_settings).toEqual({});

    // Click "SAVE" button
    click(
      app
        .find(".Header-buttonSection a")
        .first()
        .find("a"),
    );

    await store.waitForActions([Collections.actions.fetchList]);

    setInputValue(
      app.find(SaveQuestionModal).find("input[name='name']"),
      "test visualization question",
    );
    clickButton(
      app
        .find(SaveQuestionModal)
        .find("button")
        .last(),
    );
    await store.waitForActions([API_CREATE_QUESTION]);

    expect(getCard(store.getState()).visualization_settings).toEqual({
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    });

    cleanup.question(getQuestion(store.getState()).id());
  });

  it("should save the default x axis and y axis to `visualization_settings` when saving an existing question in QB", async () => {
    const store = await createTestStore();
    store.pushPath(Urls.question(savedTimeBreakoutQuestion.id()));
    app = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
    expect(getCard(store.getState()).visualization_settings).toEqual({});

    // modify the question in the UI by switching visualization type
    const vizSettings = app.find(VisualizationSettings);
    const vizSettingsTrigger = vizSettings.find("a").first();
    click(vizSettingsTrigger);
    const areaChartOption = vizSettings
      .find(Popover)
      .find("span")
      .filterWhere(elem => /Area/.test(elem.text()));
    click(areaChartOption);
    await store.waitForActions([SET_CARD_VISUALIZATION]);

    click(
      app
        .find(".Header-buttonSection a")
        .first()
        .find("a"),
    );
    expect(
      app
        .find(SaveQuestionModal)
        .find(Radio)
        .prop("value"),
    ).toBe("overwrite");
    // Click Save in "Save question" dialog
    clickButton(
      app
        .find(SaveQuestionModal)
        .find("button")
        .last(),
    );
    await store.waitForActions([API_UPDATE_QUESTION]);

    expect(getCard(store.getState()).visualization_settings).toEqual({
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    });
  });
});
