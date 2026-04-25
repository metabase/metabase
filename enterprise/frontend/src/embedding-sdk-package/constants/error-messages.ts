export const SDK_NOT_STARTED_LOADING_MESSAGE =
  "Error loading the Embedded Analytics SDK. Ensure all SDK components are wrapped in the Provider component.";

export const SDK_LOADING_ERROR_MESSAGE =
  "Error loading the Embedded Analytics SDK. Verify the instance is Enterprise and its URL is correct and reachable.";

export const SDK_NOT_LOADED_YET_MESSAGE =
  "Error loading the Embedded Analytics SDK. The loading state is `Loaded` but the SDK bundle is not loaded yet.";

export const SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE =
  "The component is not available in the Embedded Analytics SDK bundle. Update your analytics server to access the component.";

export const SDK_COMPONENT_MISSING_REQUIRED_PROPERTY_MESSAGE =
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- console.error message
  "this property is required by the component. Your Embedded Analytics SDK and Metabase instance are out of sync. Update them to matching versions and adjust props based on the updated TypeScript types.";

export const SDK_COMPONENT_UNRECOGNIZED_PROPERTY_MESSAGE =
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- console.error message
  "this property is not recognized by the component and will be ignored. Your Embedded Analytics SDK and Metabase instance are out of sync. Update them to matching versions and adjust props based on the updated TypeScript types.";
