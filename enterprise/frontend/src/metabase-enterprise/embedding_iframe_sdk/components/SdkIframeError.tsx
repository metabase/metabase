import noResultsSource from "assets/img/no_results.svg";
import { Center, Image, Stack, Text, ThemeProvider } from "metabase/ui";

// Only shown when the app is running on production yet the license is invalid.
const INVALID_LICENSE_ERROR_MESSAGE =
  "A valid license is required for embedding.";

export const SdkIframeInvalidLicenseError = () => (
  <ThemeProvider>
    <Center h="100%" mih="100vh">
      <Stack align="center">
        <Image w={120} h={120} src={noResultsSource} />

        <Text fw={500} ff="sans-serif" fz="lg">
          {INVALID_LICENSE_ERROR_MESSAGE}
        </Text>
      </Stack>
    </Center>
  </ThemeProvider>
);
