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

    it("should return bold field name when form fields match and a field occurs multiple times", () => {
      const errorMessage = "Your Username and Username might be incorrect.";
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
        screen.getByText("Your ", {
          normalizer: getDefaultNormalizer({ trim: false }),
        }),
      ).toBeInTheDocument();
      const fields = screen.getAllByText("Username");
      expect(fields[0]).toBeInTheDocument();
      expect(fields).toHaveLength(2);

      expect(
        screen.getByText(" and ", {
          normalizer: getDefaultNormalizer({ trim: false }),
        }),
      ).toBeInTheDocument();
      screen.getByText(" might be incorrect.", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
    });

    it("should return bold field name when form fields match case insensitively", () => {
      const errorMessage = "Your username is incorrect.";
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
        screen.getByText("Your ", {
          normalizer: getDefaultNormalizer({ trim: false }),
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("username")).toBeInTheDocument();
      screen.getByText(" is incorrect.", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
    });

    it("should only map the whole word", () => {
      const errorMessage = "The Username is not supported.";
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

      screen.getByText("The ", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
      expect(screen.getByText("Username")).toBeInTheDocument();
      screen.getByText(" is not supported.", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
    });

    it("should match the start of the message", () => {
      const errorMessage = "Username is not supported.";
      const errorMessageWithBoldFields = getErrorMessageWithBoldFields(
        errorMessage,
        [
          {
            name: "details.user",
            title: "Username",
          },
        ],
      );

      render(<span>{errorMessageWithBoldFields}</span>);

      expect(screen.getByText("Username")).toBeInTheDocument();
      screen.getByText(" is not supported.", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
    });

    it("should match the end of the message", () => {
      const errorMessage = "Error at Username";
      const errorMessageWithBoldFields = getErrorMessageWithBoldFields(
        errorMessage,
        [
          {
            name: "details.user",
            title: "Username",
          },
        ],
      );

      render(<span>{errorMessageWithBoldFields}</span>);

      screen.getByText("Error at ", {
        normalizer: getDefaultNormalizer({ trim: false }),
      });
      expect(screen.getByText("Username")).toBeInTheDocument();
    });

    it("should not match partial match at the start of an error", () => {
      const errorMessage = "Hostile activity detected";
      const errorMessageWithBoldFields = getErrorMessageWithBoldFields(
        errorMessage,
        [
          {
            name: "details.host",
            title: "Host",
          },
        ],
      );

      expect(errorMessageWithBoldFields).toEqual(errorMessage);
    });

    it("should not match partial match at the start of an error", () => {
      const errorMessage = "Please contact support";
      const errorMessageWithBoldFields = getErrorMessageWithBoldFields(
        errorMessage,
        [
          {
            name: "details.port",
            title: "Port",
          },
        ],
      );

      expect(errorMessageWithBoldFields).toEqual(errorMessage);
    });
  });
});
