import {
  useSharedAdminLogin,
  createTestStore,
  createSavedQuestion,
} from "__support__/integrated_tests";
import { click, setInputValue } from "__support__/enzyme_utils";

import React from "react";
import { mount } from "enzyme";

import { CardApi, PulseApi } from "metabase/services";
import Question from "metabase-lib/lib/Question";

import PulseListApp from "metabase/pulse/containers/PulseListApp";
import PulseEditApp from "metabase/pulse/containers/PulseEditApp";
import PulseListItem from "metabase/pulse/components/PulseListItem";
import CardPicker from "metabase/pulse/components/CardPicker";
import PulseCardPreview from "metabase/pulse/components/PulseCardPreview";
import Toggle from "metabase/components/Toggle";

import {
  FETCH_PULSES,
  SET_EDITING_PULSE,
  SAVE_EDITING_PULSE,
  FETCH_CARDS,
  FETCH_PULSE_CARD_PREVIEW,
} from "metabase/pulse/actions";

describe("Pulse", () => {
  let questionCount, questionRaw;
  const normalFormInput = PulseApi.form_input;

  beforeAll(async () => {
    useSharedAdminLogin();

    const formInput = await PulseApi.form_input();
    PulseApi.form_input = () => ({
      channels: {
        ...formInput.channels,
        email: {
          ...formInput.channels.email,
          configured: true,
        },
      },
    });

    questionCount = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata: null })
        .query()
        .addAggregation(["count"])
        .question()
        .setDisplay("scalar")
        .setDisplayName("count"),
    );

    questionRaw = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata: null })
        .query()
        .question()
        .setDisplay("table")
        .setDisplayName("table"),
    );

    // possibly not necessary, but just to be sure we start with clean slate
    for (const pulse of await PulseApi.list()) {
      await PulseApi.delete({ pulseId: pulse.id });
    }
  });

  afterAll(async () => {
    PulseApi.form_input = normalFormInput;

    await CardApi.delete({ cardId: questionCount.id() });
    await CardApi.delete({ cardId: questionRaw.id() });

    for (const pulse of await PulseApi.list()) {
      await PulseApi.delete({ pulseId: pulse.id });
    }
  });

  let store;
  beforeEach(async () => {
    store = await createTestStore();
  });

  it("should load pulses", async () => {
    store.pushPath("/pulse");
    const app = mount(store.connectContainer(<PulseListApp />));
    await store.waitForActions([FETCH_PULSES]);

    const items = app.find(PulseListItem);
    expect(items.length).toBe(0);
  });

  it("should load create pulse", async () => {
    store.pushPath("/pulse/create");
    const app = mount(store.connectContainer(<PulseEditApp />));
    await store.waitForActions([SET_EDITING_PULSE, FETCH_CARDS]);

    // no previews yet
    expect(app.find(PulseCardPreview).length).toBe(0);

    // set name to 'foo'
    setInputValue(app.find("input").first(), "foo");

    // email channel should be enabled
    expect(
      app
        .find(Toggle)
        .first()
        .props().value,
    ).toBe(true);

    // add count card
    app
      .find(CardPicker)
      .first()
      .props()
      .onChange(questionCount.id());
    await store.waitForActions([FETCH_PULSE_CARD_PREVIEW]);

    // add raw card
    app
      .find(CardPicker)
      .first()
      .props()
      .onChange(questionRaw.id());
    await store.waitForActions([FETCH_PULSE_CARD_PREVIEW]);

    let previews = app.find(PulseCardPreview);
    expect(previews.length).toBe(2);

    // NOTE: check text content since enzyme doesn't doesn't seem to work well with dangerouslySetInnerHTML
    expect(previews.at(0).text()).toBe("count18,760");
    expect(previews.at(0).find(".Icon-attachment").length).toBe(1);
    expect(previews.at(1).text()).toEqual(
      expect.stringContaining("Showing 20 of 18,760 rows"),
    );
    expect(previews.at(1).find(".Icon-attachment").length).toBe(0);

    // toggle email channel off
    click(app.find(Toggle).first());

    previews = app.find(PulseCardPreview);
    expect(previews.at(0).text()).toBe("count18,760");
    expect(previews.at(0).find(".Icon-attachment").length).toBe(0);
    expect(previews.at(1).text()).toEqual(
      expect.stringContaining("Showing 20 of 18,760 rows"),
    );
    expect(previews.at(1).find(".Icon-attachment").length).toBe(0);

    // toggle email channel on
    click(app.find(Toggle).first());

    // save
    const saveButton = app.find(".PulseEdit-footer .Button").first();
    expect(saveButton.hasClass("Button--primary")).toBe(true);
    click(saveButton);

    await store.waitForActions([SAVE_EDITING_PULSE]);

    const [pulse] = await PulseApi.list();
    expect(pulse.name).toBe("foo");
    expect(pulse.cards[0].id).toBe(questionCount.id());
    expect(pulse.cards[1].id).toBe(questionRaw.id());
    expect(pulse.channels[0].channel_type).toBe("email");
    expect(pulse.channels[0].enabled).toBe(true);
  });

  it("should load pulses", async () => {
    store.pushPath("/pulse");
    const app = mount(store.connectContainer(<PulseListApp />));
    await store.waitForActions([FETCH_PULSES]);

    const items = app.find(PulseListItem);
    expect(items.length).toBe(1);
  });
});
