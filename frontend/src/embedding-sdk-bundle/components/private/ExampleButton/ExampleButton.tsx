export type ExampleButtonProps = {
  label: string;
};

export const PLUGIN_SDK_EE_EXAMPLE_BUTTON = {
  ExampleButton: (_props: ExampleButtonProps) => <></>, // noop in OSS, `<></>` makes it return JSX Element to have correct type
};

export const ExampleButton = (props: ExampleButtonProps) => {
  return <PLUGIN_SDK_EE_EXAMPLE_BUTTON.ExampleButton {...props} />;
};
