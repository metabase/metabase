import { merge } from "icepick";

import { getResponseErrorMessage } from "./messages";

const ERROR_DATA_MESSAGE = {
  data: {
    message: "Error from error.data.message",
  },
};

const ERROR_DATA_ERRORS_ERROR = {
  data: {
    errors: {
      _error: "Error from error.data.errors._error",
    },
  },
};

const ERROR_MESSAGE = {
  message: "Error from error.message",
};

const ERROR_DATA = {
  data: "Error from error.data",
};

describe("core/utils/errors/messages", () => {
  describe("getResponseErrorMessage", () => {
    it("returns undefined if can't find a message", () => {
      expect(getResponseErrorMessage({})).toBeUndefined();
    });

    it("returns error.data.message", () => {
      const response = merge(
        ERROR_DATA_MESSAGE,
        merge(ERROR_DATA_ERRORS_ERROR, ERROR_MESSAGE),
      );

      const message = getResponseErrorMessage(response);

      expect(message).toEqual("Error from error.data.message");
    });

    it("returns error.data.errors._error", () => {
      const response = merge(ERROR_DATA_ERRORS_ERROR, ERROR_MESSAGE);
      const message = getResponseErrorMessage(response);
      expect(message).toEqual("Error from error.data.errors._error");
    });

    it("returns error.message", () => {
      const response = merge(ERROR_MESSAGE, ERROR_DATA);
      const message = getResponseErrorMessage(response);
      expect(message).toEqual("Error from error.message");
    });

    it("returns error.data", () => {
      const message = getResponseErrorMessage(ERROR_DATA);
      expect(message).toEqual("Error from error.data");
    });

    it("handles empty data object", () => {
      const response = {
        data: {},
        message: "Error from error.message",
      };
      const message = getResponseErrorMessage(response);
      expect(message).toBe("Error from error.message");
    });

    it("ignores field-specific errors", () => {
      const response = {
        data: {
          errors: {
            firstName: "Required",
            password: "Too short",
          },
        },
      };
      const message = getResponseErrorMessage(response);
      expect(message).toBeUndefined();
    });
  });
});
