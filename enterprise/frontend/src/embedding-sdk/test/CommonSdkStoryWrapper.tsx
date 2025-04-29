import type { StoryFn } from "@storybook/react";
import * as jose from "jose";
import { useMemo } from "react";

import { type MetabaseAuthConfig, MetabaseProvider } from "embedding-sdk";

import { USERS } from "../../../../../e2e/support/cypress_data";

import { storybookThemes } from "./storybook-themes";
const METABASE_INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";
const METABASE_JWT_SHARED_SECRET =
  (window as any).JWT_SHARED_SECRET || "0".repeat(64);

const secret = new TextEncoder().encode(METABASE_JWT_SHARED_SECRET);

/**
 * SDK auth config that signs the jwt on the FE
 */
export const getStorybookSdkAuthConfigForUser = (
  user: keyof typeof USERS = "normal",
): MetabaseAuthConfig => ({
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
  authProviderUri: `${METABASE_INSTANCE_URL}/sso/metabase`,
  fetchRequestToken: async () => {
    try {
      const signedUserData = await new jose.SignJWT({
        email: USERS[user].email,
        exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
      })
        .setProtectedHeader({ alg: "HS256" }) // algorithm
        .setIssuedAt()
        .setExpirationTime(Math.round(Date.now() / 1000) + 10 * 60) // token expiration time, e.g., "1 day"
        .sign(secret);

      const ssoUrl = new URL("/auth/sso", METABASE_INSTANCE_URL);
      ssoUrl.searchParams.set("jwt", signedUserData);
      ssoUrl.searchParams.set("token", "true");

      const response = await fetch(ssoUrl, { method: "GET" });

      return response.json();
    } catch (e) {
      console.error("Failed to generate JWT", e);
      return `Failed to generate JWT for storybook: ${e}`;
    }
  },
});

export const storybookSdkAuthDefaultConfig =
  getStorybookSdkAuthConfigForUser("normal");

export const CommonSdkStoryWrapper = (Story: StoryFn, context: any) => {
  const sdkTheme = context.globals.sdkTheme;
  const theme = sdkTheme ? storybookThemes[sdkTheme] : undefined;

  const user = context.globals.user;

  const authConfig = useMemo(() => {
    return getStorybookSdkAuthConfigForUser(user);
  }, [user]);

  return (
    <MetabaseProvider authConfig={authConfig} theme={theme} key={user}>
      <Story />
    </MetabaseProvider>
  );
};
