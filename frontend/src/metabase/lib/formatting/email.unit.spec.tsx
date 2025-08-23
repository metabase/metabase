import { render, screen } from "@testing-library/react";
import { isEmail } from "metabase/lib/email";
import { createMockColumn } from "metabase-types/api/mocks";

import { formatEmail } from "./email";

describe("formatEmail", () => {
  const setupEmail = (email: string, jsx = true, rich = true) => {
    const result = formatEmail(email, { jsx, rich, view_as: "auto" });
    if (jsx) {
      render(<>{result}</>);
    }
    return result;
  };

  describe("ASCII email addresses", () => {
    it("should format valid ASCII email as link", () => {
      setupEmail("test@example.com");
      expect(screen.getByRole("link")).toHaveAttribute("href", "mailto:test@example.com");
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("should format email with numbers and special characters as link", () => {
      setupEmail("user123+tag@sub-domain.example.com");
      expect(screen.getByRole("link")).toHaveAttribute("href", "mailto:user123+tag@sub-domain.example.com");
      expect(screen.getByText("user123+tag@sub-domain.example.com")).toBeInTheDocument();
    });
  });

  describe("Unicode email addresses", () => {
    it("should format email with Unicode characters as link", () => {
      const email = "hafthór_júlíus_björnsson@gameofthron.es";
      setupEmail(email);
      expect(screen.getByRole("link")).toHaveAttribute("href", `mailto:${email}`);
      expect(screen.getByText(email)).toBeInTheDocument();
    });

    it("should format email with various Unicode characters as link", () => {
      const email = "用户@测试.中国";
      setupEmail(email);
      expect(screen.getByRole("link")).toHaveAttribute("href", `mailto:${email}`);
      expect(screen.getByText(email)).toBeInTheDocument();
    });

    it("should format email with accented characters as link", () => {
      const email = "josé.maría@español.es";
      setupEmail(email);
      expect(screen.getByRole("link")).toHaveAttribute("href", `mailto:${email}`);
      expect(screen.getByText(email)).toBeInTheDocument();
    });
  });

  describe("Non-JSX output", () => {
    it("should return plain string when jsx is false", () => {
      const email = "test@example.com";
      const result = setupEmail(email, false);
      expect(result).toBe(email);
    });

    it("should return plain string for Unicode email when jsx is false", () => {
      const email = "hafthór_júlíus_björnsson@gameofthron.es";
      const result = setupEmail(email, false);
      expect(result).toBe(email);
    });
  });

  describe("Invalid email addresses", () => {
    it("should return plain string for invalid email format", () => {
      const invalidEmail = "not-an-email";
      const result = setupEmail(invalidEmail);
      // Should render as plain text, not as a link
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText(invalidEmail)).toBeInTheDocument();
    });

    it("should return plain string for email without domain", () => {
      const invalidEmail = "user@";
      const result = setupEmail(invalidEmail);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText(invalidEmail)).toBeInTheDocument();
    });
  });
});

describe("isEmail utility function", () => {
  describe("ASCII email addresses", () => {
    it("should validate standard ASCII emails", () => {
      expect(isEmail("test@example.com")).toBe(true);
      expect(isEmail("user123+tag@sub-domain.example.com")).toBe(true);
    });
  });

  describe("Unicode email addresses", () => {
    it("should validate email with Unicode characters from bug report", () => {
      expect(isEmail("hafthór_júlíus_björnsson@gameofthron.es")).toBe(true);
    });

    it("should validate email with various Unicode characters", () => {
      expect(isEmail("用户@测试.中国")).toBe(true);
      expect(isEmail("josé.maría@español.es")).toBe(true);
      expect(isEmail("müller@beispiel.de")).toBe(true);
    });
  });

  describe("Invalid email addresses", () => {
    it("should reject invalid email formats", () => {
      expect(isEmail("not-an-email")).toBe(false);
      expect(isEmail("user@")).toBe(false);
      expect(isEmail("@domain.com")).toBe(false);
      expect(isEmail("")).toBe(false);
      expect(isEmail(null)).toBe(false);
      expect(isEmail(undefined)).toBe(false);
    });
  });
});