import { useMemo } from "react";
import { jt, t } from "ttag";

import { ERROR_DOC_LINKS } from "embedding-sdk-bundle/errors";
import type { MetabaseErrorCode } from "embedding-sdk-bundle/errors/error-code";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getErrorComponent } from "embedding-sdk-bundle/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk-bundle/types";
import Alert from "metabase/common/components/Alert";
import { color } from "metabase/lib/colors";
import { Anchor, Box, Center, Code } from "metabase/ui";

export const SdkError = ({ message, error }: SdkErrorComponentProps) => {
  const CustomError = useSdkSelector(getErrorComponent);

  const ErrorMessageComponent = CustomError || DefaultErrorMessage;

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

  return (
    <Center h="100%" w="100%" mx="auto" data-testid="sdk-error-container">
      <ErrorMessageComponent message={errorMessage} />
    </Center>
  );
};

const FORCE_DARK_TEXT_COLOR = {
  // The Alert component has a light background, we need to force a dark text
  // color. The sdk aliases text-dark to the primary color, which in dark themes
  // is a light color, making the text un-readable
  "--mb-color-text-dark": color("text-dark"),
  "--mb-color-text-medium": color("text-medium"),
} as React.CSSProperties;

const DefaultErrorMessage = ({ message }: SdkErrorComponentProps) => (
  <Box p="sm" style={FORCE_DARK_TEXT_COLOR}>
    <Alert variant="error" icon="warning">
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
