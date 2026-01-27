import { useDisclosure } from "@mantine/hooks";
import { type CSSProperties, type PropsWithChildren, useMemo } from "react";
import { jt, t } from "ttag";

import { ERROR_DOC_LINKS } from "embedding-sdk-bundle/errors";
import type { MetabaseErrorCode } from "embedding-sdk-bundle/errors/error-code";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getErrorComponent } from "embedding-sdk-bundle/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk-bundle/types";
import { Alert } from "metabase/common/components/Alert";
import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import { color } from "metabase/lib/colors";
import { Anchor, Box, Center, Code, Flex, Portal } from "metabase/ui";

export const SdkError = ({
  message,
  error,
  type = "relative",
  withCloseButton = false,
}: Omit<SdkErrorComponentProps, "onClose">) => {
  const [visible, { close }] = useDisclosure(true);

  const CustomError = useSdkSelector(getErrorComponent);

  const errorMessage = useMemo(() => {
    if (error && "code" in error && typeof error.code === "string") {
      const docsLink = ERROR_DOC_LINKS[error.code as MetabaseErrorCode];

      if (docsLink) {
        return (
          <span>
            {error.message || message}{" "}
            <Anchor
              href={docsLink}
              target="_blank"
              rel="noopener noreferrer"
            >{t`Read more.`}</Anchor>
          </span>
        );
      }
    }

    return message;
  }, [message, error]);

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
        message={errorMessage}
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
  // color. The sdk aliases text-primary to the primary color, which in dark themes
  // is a light color, making the text un-readable
  "--mb-color-text-primary": color("text-primary"),
  "--mb-color-text-secondary": color("text-secondary"),
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
        bg="background-error-secondary"
        c="text-secondary"
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
