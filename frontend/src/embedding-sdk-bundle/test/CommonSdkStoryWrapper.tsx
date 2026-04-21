import type { StoryFn } from "@storybook/react";
import { SignJWT } from "jose";
import { useMemo } from "react";

// To run initialization side effects like Mantine styles, dayjs plugins, etc
import "embedding-sdk-bundle";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";

import { USERS } from "../../../../e2e/support/cypress_data";

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
  fetchRequestToken: async () => {
    try {
      const jwt = await new SignJWT({
        email: USERS[user].email,
        exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
      })
        .setProtectedHeader({ alg: "HS256" }) // algorithm
        .setIssuedAt()
        .setExpirationTime(Math.round(Date.now() / 1000) + 10 * 60) // token expiration time, e.g., "1 day"
        .sign(secret);
      return { jwt };
    } catch (e) {
      console.error("Failed to generate JWT", e);
      throw new Error(`Failed to generate JWT for storybook: ${e}`);
    }
  },
});

export const storybookSdkAuthDefaultConfig =
  getStorybookSdkAuthConfigForUser("normal");

export const CommonSdkStoryWrapper = (Story: StoryFn, context: any) => {
  const sdkTheme = context.globals.sdkTheme;
  const theme = sdkTheme ? storybookThemes[sdkTheme] : undefined;
  const locale = context.globals.locale;
  const user = context.globals.user;

  const key = `${user}-${locale}`;

  const authConfig = useMemo(() => {
    return getStorybookSdkAuthConfigForUser(user);
  }, [user]);

  return (
    <ComponentProvider
      authConfig={authConfig}
      theme={theme}
      key={key}
      locale={locale}
    >
      <Story />
    </ComponentProvider>
  );
};
