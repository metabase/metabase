import {
  MetabaseProvider,
  StaticQuestion,
} from "embedding-sdk/components/public";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import type { MetabaseAuthConfig } from "embedding-sdk/types";

export default {
  title: "EmbeddingSDK/styles tests",
};

const configThatWillError: MetabaseAuthConfig = {
  apiKey: "TEST",
  metabaseInstanceUrl: "http://fake-host:1234",
};

/**
 * This simulates an empty project with just the provider, we should not mess
 * with the styles either inside or outside of the provider
 */
export const NoStylesError = () => (
  <div>
    <h1>No styles applied anywhere, should use browser default</h1>
    <div style={{ border: "1px solid black" }}>
      <h1>This is outside of the provider</h1>
    </div>

    <MetabaseProvider authConfig={configThatWillError}>
      <div style={{ border: "1px solid black" }}>
        <h1>This is inside of the provider</h1>
      </div>

      <StaticQuestion questionId={(window as any).QUESTION_ID || 1} />
    </MetabaseProvider>
  </div>
);

export const NoStylesSuccess = () => (
  <div>
    <h1>No styles applied anywhere, should use browser default</h1>
    <div style={{ border: "1px solid black" }}>
      <h1>This is outside of the provider</h1>
    </div>

    <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig}>
      <div style={{ border: "1px solid black" }}>
        <h1>This is inside of the provider</h1>
      </div>

      <StaticQuestion questionId={(window as any).QUESTION_ID || 1} />
    </MetabaseProvider>
  </div>
);

export const FontFromConfig = () => (
  <div>
    <MetabaseProvider
      authConfig={storybookSdkAuthDefaultConfig}
      theme={{ fontFamily: "Impact" }}
    >
      <StaticQuestion questionId={(window as any).QUESTION_ID || 1} />
    </MetabaseProvider>
  </div>
);

/**
 * This story is only needed to get the default font of the browser
 */
export const GetBrowserDefaultFont = () => (
  <p>paragraph with default browser font</p>
);
