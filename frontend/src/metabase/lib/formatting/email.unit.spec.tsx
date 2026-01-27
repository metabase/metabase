import { cleanup, render, screen } from "@testing-library/react";
import { isElementOfType } from "react-dom/test-utils";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { createMockColumn } from "metabase-types/api/mocks";

import { formatEmail } from "./email";

describe("formatEmail", () => {
  describe("email link generation", () => {
    it("should return the email as a string when jsx is false", () => {
      const result = formatEmail("test@example.com");
      expect(result).toBe("test@example.com");
    });

    it("should create an ExternalLink for valid emails in jsx + rich mode", () => {
      const result = formatEmail("test@example.com", {
        jsx: true,
        rich: true,
      });
      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      render(result);

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "mailto:test@example.com",
      );
      expect(screen.getByRole("link")).toHaveTextContent("test@example.com");
    });

    it("should handle complex valid email addresses", () => {
      const complexEmails = [
        "user.name+tag@example.com",
        "user123@subdomain.example.org",
        "test-email@domain-name.com",
        "firstname.lastname@company.co.uk",
      ];

      complexEmails.forEach((email) => {
        const result = formatEmail(email, { jsx: true, rich: true });
        expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

        render(result);

        expect(screen.getByRole("link")).toHaveAttribute(
          "href",
          `mailto:${email}`,
        );
        expect(screen.getByRole("link")).toHaveTextContent(email);

        cleanup();
      });
    });
  });

  describe("invalid email handling", () => {
    it("should return string for invalid email addresses", () => {
      const invalidEmails = [
        "not-an-email",
        "@example.com",
        "user@",
        "user space@example.com",
        "user@.com",
        "",
      ];

      invalidEmails.forEach((email) => {
        const result = formatEmail(email, { jsx: true, rich: true });
        expect(result).toBe(email);
      });
    });

    it("should handle very long email addresses that exceed regex limits", () => {
      // Create an email that's too long (over 254 characters)
      const longEmail = `${"a".repeat(250)}@example.com`;
      const result = formatEmail(longEmail, { jsx: true, rich: true });
      expect(result).toBe(longEmail);
    });
  });

  describe("link text handling", () => {
    it("should use custom link_text when provided with clicked data", () => {
      const column = createMockColumn({ name: "email" });
      const clicked = {
        value: "test@example.com",
        column,
        data: [{ value: "test@example.com", col: column }],
      };

      const result = formatEmail("test@example.com", {
        jsx: true,
        rich: true,
        link_text: "Custom Label",
        clicked,
      });

      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      render(result);

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "mailto:test@example.com",
      );
      expect(screen.getByRole("link")).toHaveTextContent("Custom Label");
    });
  });

  describe("newline collapsing", () => {
    it("should collapse newlines in email text when collapseNewlines is true", () => {
      const emailWithNewlines = "test@example.com\n\rextra text";
      const result = formatEmail(emailWithNewlines, {
        jsx: true,
        rich: true,
        collapseNewlines: true,
      });

      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(false);
      expect(result).toBe("test@example.com  extra text");
    });

    it("should collapse newlines in custom link text when collapseNewlines is true", () => {
      const column = createMockColumn({ name: "email" });
      const clicked = {
        value: "test@example.com",
        column,
        data: [{ value: "test@example.com", col: column }],
      };

      const result = formatEmail("test@example.com", {
        jsx: true,
        rich: true,
        link_text: "Custom\nLabel",
        clicked,
        collapseNewlines: true,
      });

      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      render(result);

      expect(screen.getByRole("link")).toHaveTextContent("Custom Label");
    });

    it("should collapse newlines in string output when not in jsx mode", () => {
      const emailWithNewlines = "test@example.com\nwith newlines";
      const result = formatEmail(emailWithNewlines, {
        collapseNewlines: true,
      });

      expect(result).toBe("test@example.com with newlines");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = formatEmail("", { jsx: true, rich: true });
      expect(result).toBe("");
    });

    it("should handle null and undefined by converting to string", () => {
      expect(formatEmail(null as any)).toBe("null");
      expect(formatEmail(undefined as any)).toBe("undefined");
    });
  });
});
