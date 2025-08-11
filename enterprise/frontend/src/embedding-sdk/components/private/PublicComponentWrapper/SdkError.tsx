import { useDisclosure } from "@mantine/hooks";
import type { CSSProperties, PropsWithChildren } from "react";
import { jt, t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk/types";
import Alert from "metabase/common/components/Alert";
import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import { color } from "metabase/lib/colors";
import { Box, Center, Code, Flex, Portal } from "metabase/ui";

export const SdkError = ({
  message,
  type = "relative",
  withCloseButton = false,
}: Omit<SdkErrorComponentProps, "onClose">) => {
  const [visible, { close }] = useDisclosure(true);

  const CustomError = useSdkSelector(getErrorComponent);

  if (!visible) {
    return null;
  }

  const handleBannerClose = () => {
    close();
  };

  const ErrorMessageComponent = CustomError || DefaultErrorMessage;

  const errorMessageElement = (
    <Center h="100%" w="100%" mx="auto" data-testid="sdk-error-container">
      <ErrorMessageComponent
        type={type}
        message={message}
        {...(withCloseButton && {
          onClose: handleBannerClose,
        })}
      />
    </Center>
  );

  return (
    <>
      {type === "relative" && errorMessageElement}

      {type === "fixed" && (
        <SdkPortalErrorWrapper>{errorMessageElement}</SdkPortalErrorWrapper>
      )}
    </>
  );
};

export function SdkPortalErrorWrapper({ children }: PropsWithChildren) {
  return (
    <Portal target={`#${EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}`}>
      <Flex
        pos="fixed"
        bottom="1rem"
        left="1rem"
        right="1rem"
        style={{ zIndex: 500 }}
        align="center"
      >
        {children}
      </Flex>
    </Portal>
  );
}

const FORCE_DARK_TEXT_COLOR = {
  // The Alert component has a light background, we need to force a dark text
  // color. The sdk aliases text-dark to the primary color, which in dark themes
  // is a light color, making the text un-readable
  "--mb-color-text-dark": color("text-dark"),
  "--mb-color-text-medium": color("text-medium"),
} as CSSProperties;

const DefaultErrorMessage = ({ message, onClose }: SdkErrorComponentProps) => (
  <Box p="sm" style={FORCE_DARK_TEXT_COLOR}>
    <Alert variant="error" icon="warning" onClose={onClose}>
      {message}
    </Alert>
  </Box>
);

interface ResourceNotFoundErrorProps {
  id: string | number;
}

const ResourceNotFoundError = ({
  resource,
  id,
}: ResourceNotFoundErrorProps & { resource: string }) => (
  <SdkError
    message={jt`${resource} ${(
      <Code
        bg="var(--mb-color-background-error-secondary)"
        c="var(--mb-color-text-medium)"
        key="question-id"
      >
        {id}
      </Code>
    )} not found. Make sure you pass the correct ID.`}
  />
);

export const QuestionNotFoundError = ({ id }: ResourceNotFoundErrorProps) => (
  <ResourceNotFoundError resource={t`Question`} id={id} />
);
export const DashboardNotFoundError = ({ id }: ResourceNotFoundErrorProps) => (
  <ResourceNotFoundError resource={t`Dashboard`} id={id} />
);
export const CollectionNotFoundError = ({ id }: ResourceNotFoundErrorProps) => (
  <ResourceNotFoundError resource={t`Collection`} id={id} />
);
