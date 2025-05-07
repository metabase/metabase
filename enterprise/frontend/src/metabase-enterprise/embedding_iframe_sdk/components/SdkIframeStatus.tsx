import noResultsSource from "assets/img/no_results.svg";
import { Center, Image, Loader, Stack, Text, ThemeProvider } from "metabase/ui";

export const SdkIframeLoading = () => (
  <ThemeProvider>
    <Center h="100%" mih="100vh">
      <Loader />
    </Center>
  </ThemeProvider>
);

export const SdkIframeInvalidLicenseError = () => (
  <ThemeProvider>
    <Center h="100%" mih="100vh">
      <Stack align="center">
        <Image w={120} h={120} src={noResultsSource} />

        <Text fw={500} ff="sans-serif" fz="lg">
          A valid license is required for embedding.
        </Text>
      </Stack>
    </Center>
  </ThemeProvider>
);
