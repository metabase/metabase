import * as Errors from "metabase/lib/errors";

import { LICENSE_TOKEN_SCHEMA } from "./constants";

describe("LICENSE_TOKEN_SCHEMA", () => {
  it("should validate a valid license token with the correct length", async () => {
    const validLicenseToken = "a".repeat(64);
    await expect(
      LICENSE_TOKEN_SCHEMA.validate({ license_token: validLicenseToken }),
    ).resolves.toEqual({ license_token: validLicenseToken });
  });

  it('should validate a valid license token that starts with "airgap_"', async () => {
    const validLicenseTokenAirgap = "airgap_toucan";
    await expect(
      LICENSE_TOKEN_SCHEMA.validate({ license_token: validLicenseTokenAirgap }),
    ).resolves.toEqual({ license_token: validLicenseTokenAirgap });
  });

  it("should show a length error for an invalid length license token", async () => {
    const invalidLicenseToken = "a".repeat(63); // One character too short and does not start with "airgap_"
    await expect(
      LICENSE_TOKEN_SCHEMA.validate({ license_token: invalidLicenseToken }),
    ).rejects.toThrow(Errors.exactLength({ length: 64 }));
  });

  it("should show the length error when license token is not provided", async () => {
    await expect(LICENSE_TOKEN_SCHEMA.validate({})).rejects.toThrow(
      Errors.exactLength({ length: 64 }),
    );
  });

  it("should show an error when license token is undefined", async () => {
    await expect(
      LICENSE_TOKEN_SCHEMA.validate({ license_token: undefined }),
    ).rejects.toThrow(Errors.exactLength({ length: 64 }));
  });

  it('should not validate a license token with invalid length that does not start with "airgap_"', async () => {
    const invalidLicenseToken = "b".repeat(65); // Too long and does not start with "airgap_"
    await expect(
      LICENSE_TOKEN_SCHEMA.validate({ license_token: invalidLicenseToken }),
    ).rejects.toThrow(Errors.exactLength({ length: 64 }));
  });
});
