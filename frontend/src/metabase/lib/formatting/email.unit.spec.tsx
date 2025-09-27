import { cleanup, render, screen } from "@testing-library/react";
import { isElementOfType } from "react-dom/test-utils";

import ExternalLink from "metabase/common/components/ExternalLink";
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

    it("should work with email addresses containing ASCII special characters", () => {
      const specialEmails = [
        "user+tag@example.com",
        "user.name@example.com",
        "user_name@example.com",
        "user-name@example.com",
        "user123@example.com",
      ];

      specialEmails.forEach((email) => {
        const result = formatEmail(email, { jsx: true, rich: true });
        expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

        render(result);

        expect(screen.getByRole("link")).toHaveAttribute(
          "href",
          `mailto:${email}`,
        );

        cleanup();
      });
    });

    it("should handle emails with Unicode/international characters", () => {
      const unicodeEmails = [
        "hafthór_júlíus_björnsson@gameofthron.es", // Original example with accented characters
        "test.用户@example.com", // Chinese characters
        "josé.garcía@café.org", // Spanish accented characters
        "müller@münchen.de", // German umlauts
        "andré@québec.ca", // French accented characters
      ];

      unicodeEmails.forEach((email) => {
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

    it("should handle emails with quoted local parts", () => {
      // These are technically valid emails according to RFC 5322 but may not pass the regex
      const quotedEmails = [
        '"user name"@example.com',
        '"special.chars"@example.com',
        '"test@test"@example.com',
      ];

      quotedEmails.forEach((email) => {
        const result = formatEmail(email, { jsx: true, rich: true });
        // Document current behavior - these likely won't pass the current regex
        expect(result).toBe(email);
      });
    });

    it("should handle emails with unusual but valid characters", () => {
      const unusualEmails = [
        "user!#$%&'*+-/=?^_`{|}~@example.com", // All allowed special chars in local part
        "x@example-domain.com",
        "test@sub.domain.example.org",
      ];

      unusualEmails.forEach((email) => {
        const result = formatEmail(email, { jsx: true, rich: true });

        expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);
        render(result);
        expect(screen.getByRole("link")).toHaveAttribute(
          "href",
          `mailto:${email}`,
        );
        cleanup();
      });
    });
  });
});
