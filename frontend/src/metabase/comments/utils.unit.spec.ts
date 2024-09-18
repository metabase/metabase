import { toMentionDisplay } from "./utils";

describe("comments/mention", () => {
  describe("toMentionDisplay", () => {
    it("should convert to a display comment with mention", () => {
      const comment =
        "Hey @[Oisin](123) and @[Ryan](456) can you check this out?";
      const expectedComment = "Hey @Oisin and @Ryan can you check this out?";
      expect(
        toMentionDisplay(comment, {
          123: { common_name: "Oisin" },
          456: { common_name: "Ryan" },
        }),
      ).toEqual(expectedComment);
    });

    it("should not convert a user ID not existing in the mapping", () => {
      const comment =
        "Hey @[Oisin](123) and @[Ryan](456) can you check this out?";
      const expectedComment = "Hey @Oisin and <@456> can you check this out?";
      expect(
        toMentionDisplay(comment, {
          123: { common_name: "Oisin" },
        }),
      ).toEqual(expectedComment);
    });
  });

  describe("toMentionData", () => {});
});
