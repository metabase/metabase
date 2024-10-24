import MetabaseSettings from "metabase/lib/settings";
import type {
  QuestionChangeClickAction,
  UrlClickAction,
} from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";

import { performAction } from "./action";

describe("performAction", () => {
  it('should redirect using router if a "relative" url has been passed', () => {
    MetabaseSettings.set("site-url", "http://localhost");
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(() => "auto/dashboard/adhoc/123Abc"),
    };

    const extraProps = {
      dispatch: jest.fn(),
      onChangeCardAndRun: jest.fn(),
      onUpdateQuestion: jest.fn(),
    };

    expect(performAction(action, extraProps)).toBe(true);

    expect(action.url).toHaveBeenCalledTimes(1);

    expect(extraProps.dispatch).toHaveBeenCalledTimes(2);
    expect(extraProps.dispatch).toHaveBeenCalledWith({
      payload: {
        args: [
          {
            hash: "",
            pathname: "/auto/dashboard/adhoc/123Abc",
            query: {},
            search: "",
          },
        ],
        method: "push",
      },
      type: "@@router/CALL_HISTORY_METHOD",
    });
  });

  describe.each([
    {
      sitePath: "http://localhost",
      name: "without subpath without trailing slash",
    },
    {
      sitePath: "http://localhost/",
      name: "without subpath with trailing slash",
    },
    {
      sitePath: "http://localhost/Metabase",
      name: "with subpath without trailing slash",
    },
    {
      sitePath: "http://localhost/Metabase/",
      name: "with subpath with trailing slash",
    },
    {
      sitePath: "http://localhost/Metabase/path",
      name: "with 2 levels deep subpath without trailing slash",
    },
    {
      sitePath: "http://localhost/Metabase/path/",
      name: "with 2 levels deep subpath with trailing slash",
    },
  ])(`when site URL is $name`, ({ sitePath }) => {
    it.each(["/", "/question/1", "/question/1/"])(
      `should redirect using router when using a relative URL with leading slash: "%s"`,
      url => {
        MetabaseSettings.set("site-url", sitePath);
        const action: UrlClickAction = {
          buttonType: "horizontal",
          name: "automatic-insights",
          section: "auto",
          url: jest.fn(() => url),
        };

        const extraProps = {
          dispatch: jest.fn(),
          onChangeCardAndRun: jest.fn(),
          onUpdateQuestion: jest.fn(),
        };

        expect(performAction(action, extraProps)).toBe(true);

        expect(action.url).toHaveBeenCalledTimes(1);

        expect(extraProps.dispatch).toHaveBeenCalledTimes(2);
        expect(extraProps.dispatch).toHaveBeenCalledWith({
          payload: {
            args: [
              {
                hash: "",
                pathname: url,
                query: {},
                search: "",
              },
            ],
            method: "push",
          },
          type: "@@router/CALL_HISTORY_METHOD",
        });
      },
    );

    it.each(["auto/dashboard/adhoc/123Abc", "auto/dashboard/adhoc/123Abc/"])(
      `should redirect using router when using a relative URL: "%s"`,
      url => {
        MetabaseSettings.set("site-url", sitePath);
        const action: UrlClickAction = {
          buttonType: "horizontal",
          name: "automatic-insights",
          section: "auto",
          url: jest.fn(() => url),
        };

        const extraProps = {
          dispatch: jest.fn(),
          onChangeCardAndRun: jest.fn(),
          onUpdateQuestion: jest.fn(),
        };

        expect(performAction(action, extraProps)).toBe(true);

        expect(action.url).toHaveBeenCalledTimes(1);

        expect(extraProps.dispatch).toHaveBeenCalledTimes(2);
        expect(extraProps.dispatch).toHaveBeenCalledWith({
          payload: {
            args: [
              {
                hash: "",
                pathname: "/" + url,
                query: {},
                search: "",
              },
            ],
            method: "push",
          },
          type: "@@router/CALL_HISTORY_METHOD",
        });
      },
    );

    it("should redirect using router when using an absolute URL containing site URL", () => {
      MetabaseSettings.set("site-url", sitePath);
      const action: UrlClickAction = {
        buttonType: "horizontal",
        name: "automatic-insights",
        section: "auto",
        url: jest.fn(
          // This ensures that even if the subpath has different cases, it will still work
          () => `${sitePath.toLowerCase()}/auto/dashboard/adhoc/123Abc`,
        ),
      };

      const extraProps = {
        dispatch: jest.fn(),
        onChangeCardAndRun: jest.fn(),
        onUpdateQuestion: jest.fn(),
      };

      expect(performAction(action, extraProps)).toBe(true);

      expect(action.url).toHaveBeenCalledTimes(1);

      expect(extraProps.dispatch).toHaveBeenCalledTimes(2);
      expect(extraProps.dispatch).toHaveBeenCalledWith({
        payload: {
          args: [
            {
              hash: "",
              pathname: "/auto/dashboard/adhoc/123Abc",
              query: {},
              search: "",
            },
          ],
          method: "push",
        },
        type: "@@router/CALL_HISTORY_METHOD",
      });
    });

    it("should redirect with invalid URL", () => {
      MetabaseSettings.set("site-url", sitePath);
      const action: UrlClickAction = {
        buttonType: "horizontal",
        name: "automatic-insights",
        section: "auto",
        url: jest.fn(
          () =>
            "invalid_protocol://localhost/metabase/auto/dashboard/adhoc/123Abc",
        ),
      };

      const extraProps = {
        dispatch: jest.fn(),
        onChangeCardAndRun: jest.fn(),
        onUpdateQuestion: jest.fn(),
      };

      expect(performAction(action, extraProps)).toBe(true);

      expect(action.url).toHaveBeenCalledTimes(1);

      expect(extraProps.dispatch).toHaveBeenCalledTimes(2);
      expect(extraProps.dispatch).toHaveBeenCalledWith({
        payload: {
          args: [
            {
              hash: "",
              pathname:
                "/invalid_protocol://localhost/metabase/auto/dashboard/adhoc/123Abc",
              query: {},
              search: "",
            },
          ],
          method: "push",
        },
        type: "@@router/CALL_HISTORY_METHOD",
      });
    });
  });

  it("performs question change actions according to question change behavior", () => {
    const mockQuestion = Question.create();

    const defaultQuestionAction: QuestionChangeClickAction = {
      name: "bar",
      question: () => mockQuestion,
      buttonType: "horizontal",
      section: "auto",
    };

    const updateQuestionAction: QuestionChangeClickAction = {
      ...defaultQuestionAction,
      questionChangeBehavior: "updateQuestion",
    };

    const extraProps = {
      dispatch: jest.fn(),
      onChangeCardAndRun: jest.fn(),
      onUpdateQuestion: jest.fn(),
    };

    expect(performAction(defaultQuestionAction, extraProps)).toBe(true);

    expect(extraProps.onChangeCardAndRun).toHaveBeenCalledTimes(1);
    expect(extraProps.onChangeCardAndRun).toHaveBeenCalledWith({
      nextCard: mockQuestion.card(),
    });

    expect(performAction(updateQuestionAction, extraProps)).toBe(true);

    expect(extraProps.onUpdateQuestion).toHaveBeenCalledTimes(1);
    expect(extraProps.onUpdateQuestion).toHaveBeenCalledWith(mockQuestion);
  });
});
