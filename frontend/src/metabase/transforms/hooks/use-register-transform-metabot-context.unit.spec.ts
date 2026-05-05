import {
  createMockTransform,
  createMockTransformSource,
} from "metabase-types/api/mocks";

import { registerTransformMetabotContextFn } from "./use-register-transform-metabot-context";

describe("registerTransformMetabotContextFn", () => {
  it("returns empty context when transform and source are missing", () => {
    expect(
      registerTransformMetabotContextFn({
        transform: undefined,
        source: undefined,
      }),
    ).toEqual({});
  });

  it("includes transform runtime errors in metabot context", () => {
    const transform = createMockTransform();

    const result = registerTransformMetabotContextFn({
      transform,
      source: transform.source,
      error: "column does not exist",
    });

    expect(result).toEqual({
      user_is_viewing: [
        expect.objectContaining({
          type: "transform",
          id: transform.id,
          error: "column does not exist",
        }),
      ],
    });
  });

  it("normalizes object-shaped query errors to a string", () => {
    const source = createMockTransformSource();

    const result = registerTransformMetabotContextFn({
      transform: undefined,
      source,
      error: { status: 400, data: "syntax error at or near FROM" },
    });

    expect(result).toEqual({
      user_is_viewing: [
        expect.objectContaining({
          type: "transform",
          error: "syntax error at or near FROM",
        }),
      ],
    });
  });
});
