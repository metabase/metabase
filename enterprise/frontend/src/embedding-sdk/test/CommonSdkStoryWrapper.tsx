import type { StoryFn } from "@storybook/react";
import * as jose from "jose";
import { useMemo } from "react";

import type { MetabaseAuthConfig } from "embedding-sdk";
import * as sdk_live_code from "embedding-sdk";

import { sdk_52_stable, sdk_53_stable } from "./SDK_FROM_NPM";

console.log("sdk_52_stable", sdk_52_stable); // <-- this breaks it, probably because it makes the import stay, so it's the import that's breaking stuff

export const SDK_VERSIONS = {
  live_code: sdk_live_code,
  // sdk_53_stable,
  // sdk_52_stable,
};

console.log("SDK_VERSIONS", SDK_VERSIONS);

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
  // useEffect(() => {
  //   console.log("CommonSdkStoryWrapper mounted");
  //   return () => {
  //     console.log("CommonSdkStoryWrapper unmounted");
  //   };
  // }, []);

  const sdkTheme = context.globals.sdkTheme || "default";
  const theme = sdkTheme ? storybookThemes[sdkTheme] : undefined;

  const user = context.globals.user;

  const authConfig = useMemo(() => {
    return getStorybookSdkAuthConfigForUser(user);
  }, [user]);

  const sdkVersion = (context.globals.sdkVersion ||
    "live_code") as keyof typeof SDK_VERSIONS;
  const sdk = SDK_VERSIONS[sdkVersion];

  console.log("CommonSdkStoryWrapper", { sdk });

  const { MetabaseProvider, StaticQuestion } = sdk;

  const key = `sdk-${sdkVersion}-${sdkTheme}`;

  console.log("KEY", key);

  return (
    <MetabaseProvider authConfig={authConfig} theme={theme} key={user}>
      <Story />
    </MetabaseProvider>
  );
};
