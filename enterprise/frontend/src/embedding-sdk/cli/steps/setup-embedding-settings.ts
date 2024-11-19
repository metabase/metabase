import ora from "ora";

import { HARDCODED_JWT_SHARED_SECRET } from "../constants/config";
import { getEmbeddingFailedMessage } from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { propagateErrorResponse } from "../utils/propagate-error-response";

/**
 * This step must be after the license setup step, otherwise the JWT
 * configuration will not be applied.
 */
export const setupEmbeddingSettings: CliStepMethod = async state => {
  const { cookie = "" } = state;

  const spinner = ora("Enabling embedding features...").start();

  let settings: Record<string, string | boolean> = {
    "embedding-homepage": "visible",
    "enable-embedding": true,
    "setup-license-active-at-setup": false,
    "setup-embedding-autoenabled": true,
  };

  // We can only enable JWT configuration with a valid license key.
  // Otherwise it throws "setting jwt-shared-secret is not enabled because feature :sso-jwt is not available"
  if (state.token) {
    settings = {
      ...settings,
      "jwt-enabled": true,
      "jwt-group-sync": true,
      "jwt-user-provisioning-enabled?": true,
      "jwt-shared-secret": HARDCODED_JWT_SHARED_SECRET,

      // This is a dummy required to activate the JWT feature,
      // otherwise the API returns "SSO has not been enabled"
      "jwt-identity-provider-uri": state.instanceUrl ?? "",
    };
  }

  try {
    const res = await fetch(`${state.instanceUrl}/api/setting`, {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "content-type": "application/json", cookie },
    });

    await propagateErrorResponse(res);
    spinner.succeed();

    return [{ type: "success" }, state];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = getEmbeddingFailedMessage(reason);

    spinner.fail();

    return [{ type: "error", message }, state];
  }
};
