import {
  type ExampleButtonProps,
  PLUGIN_SDK_EE_EXAMPLE_BUTTON,
} from "embedding-sdk-bundle/components/private/ExampleButton/ExampleButton";

// not exported because, in 99% of the cases we cannot use this directly without the plugin so it would only
// be suggested by the IDE but then we'll get the `no-restrict-import` error if we import it from oss code
const ExampleButton = (props: ExampleButtonProps) => {
  return <button>{props.label}</button>;
};

// Note 1: this may be wrapped in a hasTokenFeature check and/or in a initializePlugin function
// Note 2: we could do `PLUGIN_SDK_EE_EXAMPLE_BUTTON.ExampleButton = (props) =>....` but then it'll complain
// that the inline component doesn't have a display name
PLUGIN_SDK_EE_EXAMPLE_BUTTON.ExampleButton = ExampleButton;
