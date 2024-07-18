import type { ComponentStory } from "@storybook/react";
import * as jose from "jose";

import {
  StaticDashboard,
  MetabaseProvider,
  type SDKConfig,
} from "embedding-sdk";

const METABASE_INSTANCE_URL = "http://localhost:3000";
const METABASE_JWT_SHARED_SECRET =
  (window as any).JWT_SHARED_SECRET || "0".repeat(64);

// eslint-disable-next-line no-console
console.log(METABASE_JWT_SHARED_SECRET, (window as any).JWT_SHARED_SECRET);

const secret = new TextEncoder().encode(METABASE_JWT_SHARED_SECRET);

const user = {
  firstName: "Rene",
  lastName: "Mueller",
  email: "rene@example.com",
  password: "password",
  shopId: 1,
};

const DEFAULT_CONFIG: SDKConfig = {
  metabaseInstanceUrl: "http://localhost:3000",
  jwtProviderUri: `http://localhost:3535/sso/metabase`,
  fetchRequestToken: async () => {
    try {
      const signedUserData = await new jose.SignJWT({
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
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
    }
  },
};

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/StaticDashboard",
  component: StaticDashboard,
};

const Template: ComponentStory<typeof StaticDashboard> = args => {
  return (
    <MetabaseProvider config={DEFAULT_CONFIG}>
      <StaticDashboard {...args} />
    </MetabaseProvider>
  );
};

export const Default = Template.bind({});
Default.args = {
  dashboardId: "1",
};
