import type { MetabotChatContext, MetabotEntityInfo } from "metabase-types/api";

import { getViewingEntityMention } from "./use-ask-metabot-about-current-entity";

const buildContext = (
  userIsViewing: MetabotChatContext["user_is_viewing"],
): MetabotChatContext => ({
  user_is_viewing: userIsViewing,
  current_time_with_timezone: "2026-01-01T00:00:00+00:00",
  capabilities: [],
});

describe("getViewingEntityMention", () => {
  it("returns null when nothing is being viewed", () => {
    expect(getViewingEntityMention(buildContext([]))).toBeNull();
  });

  it("maps a viewed question to a question mention", () => {
    expect(
      getViewingEntityMention(
        buildContext([{ type: "question", id: 42, name: "Orders" }]),
      ),
    ).toEqual({ id: 42, model: "question", name: "Orders" });
  });

  it.each<[MetabotEntityInfo, { model: string; id: number }]>([
    [
      { type: "dashboard", id: 1, name: "Dash" },
      { model: "dashboard", id: 1 },
    ],
    [
      { type: "model", id: 2, name: "Model" },
      { model: "model", id: 2 },
    ],
    [
      { type: "document", id: 3, name: "Doc" },
      { model: "document", id: 3 },
    ],
  ])("maps %o to the right protocol model", (entity, expected) => {
    expect(getViewingEntityMention(buildContext([entity]))).toMatchObject(
      expected,
    );
  });

  it("falls back to a generic, non-empty label when the entity has no name", () => {
    const mention = getViewingEntityMention(
      buildContext([{ type: "dashboard", id: 7 }]),
    );
    expect(mention).toMatchObject({ id: 7, model: "dashboard" });
    expect(mention?.name).toBeTruthy();
  });

  it("skips entities that can't be @mentioned", () => {
    // adhoc queries have no id, metrics have no protocol model, and the code
    // editor isn't an entity at all
    expect(
      getViewingEntityMention(buildContext([{ type: "adhoc", name: "X" }])),
    ).toBeNull();
    expect(
      getViewingEntityMention(
        buildContext([{ type: "metric", id: 9, name: "Y" }]),
      ),
    ).toBeNull();
    expect(
      getViewingEntityMention(
        buildContext([{ type: "code_editor", buffers: [] }]),
      ),
    ).toBeNull();
  });

  it("returns the first mentionable entity when several are present", () => {
    expect(
      getViewingEntityMention(
        buildContext([
          { type: "adhoc", name: "ignored" },
          { type: "dashboard", id: 5, name: "Dash" },
          { type: "question", id: 6, name: "Q" },
        ]),
      ),
    ).toEqual({ id: 5, model: "dashboard", name: "Dash" });
  });
});
