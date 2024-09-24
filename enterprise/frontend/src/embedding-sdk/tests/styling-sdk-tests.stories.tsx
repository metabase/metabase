import {
  MetabaseProvider,
  StaticQuestion,
} from "embedding-sdk/components/public";
import { storybookSdkDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";
import type { SDKConfig } from "embedding-sdk/types";

export default {
  title: "EmbeddingSDK/styles tests",
};

const configThatWillError: SDKConfig = {
  apiKey: "TEST",
  metabaseInstanceUrl: "http://localhost",
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

    <MetabaseProvider config={configThatWillError}>
      <div style={{ border: "1px solid black" }}>
        <h1>This is inside of the provider</h1>
      </div>

      <StaticQuestion questionId={1} />
    </MetabaseProvider>
  </div>
);

export const NoStylesSuccess = () => (
  <div>
    <h1>No styles applied anywhere, should use browser default</h1>
    <div style={{ border: "1px solid black" }}>
      <h1>This is outside of the provider</h1>
    </div>

    <MetabaseProvider config={storybookSdkDefaultConfig}>
      <div style={{ border: "1px solid black" }}>
        <h1>This is inside of the provider</h1>
      </div>

      <StaticQuestion questionId={1} />
    </MetabaseProvider>
  </div>
);
