import noResultsSource from "assets/img/no_results.svg";
import { Center, Image, Stack, Text, ThemeProvider } from "metabase/ui";

export const SdkIframeError = ({ message }: { message: string }) => (
  <ThemeProvider>
    <Center h="100%" mih="100vh">
      <Stack align="center">
        <Image w={120} h={120} src={noResultsSource} />

        <Text fw={500} ff="sans-serif" fz="lg">
          {message}
        </Text>
      </Stack>
    </Center>
  </ThemeProvider>
);

// Only shown when the app is running on production yet the license is invalid.
export const SdkIframeInvalidLicenseError = () => (
  <SdkIframeError message="A valid license is required for embedding." />
);

// Only shown when the app is running on production yet they are using an API key.
export const SdkIframeApiKeyInProductionError = () => (
  <SdkIframeError message="Using an API key in production is not allowed." />
);

// Only shown when the app is running on production yet they are using an existing user session.
export const SdkIframeExistingUserSessionInProductionError = () => (
  <SdkIframeError message="Using the existing user's session in production is not allowed." />
);
