import React from "react";

import { getDefaultNormalizer, render, screen } from "@testing-library/react";
import { getErrorMessageWithBoldFields } from "metabase/lib/form";

describe("form", () => {
  describe("getErrorMessageWithBoldFields", () => {
    it("should return original message when it's not a string", () => {
      const errorMessage = undefined;
      expect(getErrorMessageWithBoldFields(errorMessage, undefined)).toBe(
        errorMessage,
      );
      expect(getErrorMessageWithBoldFields(errorMessage, [])).toBe(
        errorMessage,
      );
      expect(
        getErrorMessageWithBoldFields(errorMessage, [
          {
            name: "details.port",
            title: "Port",
          },
        ]),
      ).toBe(errorMessage);
    });

    it("should return original string when no formFields is passed", () => {
      const errorMessage =
        "We couldn't connect to the SSH tunnel host. Check the Username and Password.";
      expect(getErrorMessageWithBoldFields(errorMessage, [])).toBe(
        errorMessage,
      );
      expect(getErrorMessageWithBoldFields(errorMessage, undefined)).toBe(
        errorMessage,
      );
    });

    it("should return original string when no field matches", () => {
      const errorMessage =
        "We couldn't connect to the SSH tunnel host. Check the Username and Password.";
      expect(
        getErrorMessageWithBoldFields(errorMessage, [
          {
            name: "details.port",
            title: "Port",
          },
        ]),
      ).toBe(errorMessage);
    });

    it("should return bold field name when form fields match", () => {
      const errorMessage =
        "We couldn't connect to the SSH tunnel host. Check the Username and Password.";
      const errorMessageWithBoldFields = getErrorMessageWithBoldFields(
        errorMessage,
        [
          {
            name: "details.port",
            title: "Port",
          },
          {
            name: "details.user",
            title: "Username",
          },
        ],
      );

      render(<span>{errorMessageWithBoldFields}</span>);

      expect(
        screen.getByText(
          "We couldn't connect to the SSH tunnel host. Check the ",
          {
            normalizer: getDefaultNormalizer({ trim: false }),
          },
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Username")).toBeInTheDocument();
      screen.getByText(" and Password.", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
    });
  });
});
