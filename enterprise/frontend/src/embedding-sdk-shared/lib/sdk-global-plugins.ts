type HandleLinkFn = (url: string) => boolean | void;

type SdkGlobalPlugins = {
  handleLink?: HandleLinkFn;
};

declare global {
  interface Window {
    SDK_GLOBAL_PLUGINS?: SdkGlobalPlugins;
  }
}

window.SDK_GLOBAL_PLUGINS = window.SDK_GLOBAL_PLUGINS || {};
export const SDK_GLOBAL_PLUGINS: SdkGlobalPlugins = window.SDK_GLOBAL_PLUGINS!;
