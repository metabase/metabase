import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import type {
  LoginStatusError,
  SdkErrorComponentProps,
} from "embedding-sdk/store/types";
import { Box, Center, Icon, Stack, Text } from "metabase/ui";

import { getErrorInfo } from "./errors";

export const SdkError = ({ status, code }: LoginStatusError["data"]) => {
  const CustomError = useSdkSelector(getErrorComponent);

  const { title, description, link } = getErrorInfo(status);

  const ErrorMessageComponent = CustomError || DefaultErrorMessage;

  return (
    <ErrorMessageComponent
      status={status}
      code={code}
      title={title}
      description={description}
      link={link}
    />
  );
};

const DefaultErrorMessage = ({
  title,
  description,
  link,
  code,
  status,
}: SdkErrorComponentProps) => (
  <Box w="100%" h="100%">
    <Center p="xl">
      <Stack align="center" w="20rem">
        <Icon name="warning" w="5rem" h="5rem" />
        <Text fw="bold" ta="center">
          {title}
        </Text>
        <Text ta="center">{description}</Text>
        {link && <Text ta="center">Learn more at {link}</Text>}
        <Text ta="center" size="xs">
          Code: {code ? `${code}:` : null}
          {status}
        </Text>
      </Stack>
    </Center>
  </Box>
);
