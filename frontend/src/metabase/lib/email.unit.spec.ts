import { isEmail } from "metabase/lib/email";

describe("isEmail", () => {
  it("should work with email addresses containing ASCII special characters", () => {
    const specialEmails = [
      "user+tag@example.com",
      "user.name@example.com",
      "user_name@example.com",
      "user-name@example.com",
      "user123@example.com",
    ];

    specialEmails.forEach((email) => {
      expect(isEmail(email)).toBe(true);
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
      expect(isEmail(email)).toBe(true);
    });
  });

  it("should handle emails with unusual but valid characters", () => {
    const unusualEmails = [
      "user!#$%&'*+-/=?^_`{|}~@example.com", // All allowed special chars in local part
      "x@example-domain.com",
      "test@sub.domain.example.org",
    ];

    unusualEmails.forEach((email) => {
      expect(isEmail(email)).toBe(true);
    });
  });
});
