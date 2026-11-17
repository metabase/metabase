import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import { validateFunctionSchema } from "./validate-function-schema";

describe("validateFunctionSchema", () => {
  it("reports an entity prop custom validation failure as a missing required property", () => {
    const schema: FunctionSchema = {
      input: [
        Yup.object({
          questionId: Yup.mixed().optional(),
          token: Yup.mixed().optional(),
          query: Yup.mixed().optional(),
        }).test(
          "has-entity-prop",
          "questionId, token, or query is required",
          (props) =>
            props != null &&
            (props.questionId !== undefined ||
              props.token !== undefined ||
              props.query !== undefined),
        ),
      ],
    };

    const { validateParameters } = validateFunctionSchema(schema);

    expect(validateParameters([{}])).toEqual({
      success: false,
      errorMetadata: {
        errorCode: "missing_required_property",
        data: "questionId, token, or query",
        parameterIndex: 0,
      },
    });
  });
});
