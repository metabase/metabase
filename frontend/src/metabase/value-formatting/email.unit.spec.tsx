import { formatEmail } from "./email";

// Pure engine behaviour only. The jsx + rich rendering path needs the
// registered renderer and is tested in
// visualizations/lib/register-jsx-formatting.unit.spec.tsx.
describe("formatEmail", () => {
  it("should return the email as a string when jsx is false", () => {
    const result = formatEmail("test@example.com");
    expect(result).toBe("test@example.com");
  });

  it("should collapse newlines in string output when not in jsx mode", () => {
    const emailWithNewlines = "test@example.com\nwith newlines";
    const result = formatEmail(emailWithNewlines, {
      collapseNewlines: true,
    });

    expect(result).toBe("test@example.com with newlines");
  });

  it("should handle null and undefined by converting to string", () => {
    // Unjustified type cast. FIXME
    expect(formatEmail(null as any)).toBe("null");
    // Unjustified type cast. FIXME
    expect(formatEmail(undefined as any)).toBe("undefined");
  });
});
