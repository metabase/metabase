import cx from "classnames";
import { forwardRef } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ErrorDetails } from "metabase/common/components/ErrorDetails/ErrorDetails";
import type { ErrorDetailsProps } from "metabase/common/components/ErrorDetails/types";
import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";

import {
  ErrorDiagnosticModalTrigger,
  ErrorExplanationModal,
} from "./ErrorDiagnosticModal";
import S from "./ErrorPages.module.css";

interface GenericErrorProps {
  title?: string;
  message?: string;
  details: ErrorDetailsProps["details"];
}
export const GenericError = forwardRef<HTMLDivElement, GenericErrorProps>(
  function _GenericError(
    {
      title = t`Something’s gone wrong`,
      message = t`We’ve run into an error. You can try refreshing the page, or just go back.`,
      details,
    },
    ref,
  ) {
    return (
      <Flex
        ref={ref}
        className={S.root}
        direction="column"
        w="100%"
        h="100%"
        justify="center"
        align="center"
      >
        <EmptyState
          title={title}
          message={message}
          illustrationElement={
            <div
              className={cx(
                QueryBuilderS.QueryErrorImage,
                QueryBuilderS.QueryErrorImageServerError,
              )}
            />
          }
        />
        <ErrorDetails className={CS.pt2} details={details} centered />
        <ErrorDiagnosticModalTrigger />
      </Flex>
    );
  },
);

export const NotFound = ({
  title = t`We're a little lost...`,
  message = t`The page you asked for couldn't be found.`,
}: {
  title?: string;
  message?: string;
}) => (
  <Flex
    aria-label="error page"
    className={S.root}
    direction="column"
    w="100%"
    h="100%"
    justify="center"
    align="center"
  >
    <EmptyState
      illustrationElement={<img src={NoResults} />}
      title={title}
      message={message}
    />
  </Flex>
);

export const Unauthorized = () => (
  <Flex
    className={S.root}
    direction="column"
    w="100%"
    h="100%"
    justify="center"
    align="center"
  >
    <EmptyState
      title={t`Sorry, you don’t have permission to see that.`}
      illustrationElement={<Icon name="key" size={100} />}
    />
  </Flex>
);

export const Archived = ({
  entityName,
  linkTo,
}: {
  entityName: string;
  linkTo: string;
}) => (
  <Flex
    className={S.root}
    direction="column"
    w="100%"
    h="100%"
    justify="center"
    align="center"
  >
    <EmptyState
      title={t`This ${entityName} has been archived`}
      illustrationElement={<Icon name="view_archive" size={100} />}
      link={linkTo}
    />
  </Flex>
);

export const SmallGenericError = forwardRef<
  HTMLDivElement,
  {
    message?: string;
    bordered?: boolean;
  }
>(function SmallGenericErrorInner(
  { message = t`Something’s gone wrong.`, bordered = true, ...props },
  ref,
) {
  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] =
    useToggle(false);

  const isEmbeddingIframe = getIsEmbeddingIframe();

  const tooltipMessage = isEmbeddingIframe
    ? message
    : message + t` Click for more information`;

  return (
    <Flex
      ref={ref}
      className={cx(S.root, { [S.bordered]: bordered })}
      direction="column"
      w="100%"
      h="100%"
      justify="center"
      align="center"
      {...props}
    >
      <Tooltip label={tooltipMessage}>
        {isEmbeddingIframe ? (
          <Icon name="warning" size={32} c="text-disabled" />
        ) : (
          <Button
            leftSection={<Icon name="warning" size={32} c="text-disabled" />}
            color="text-disabled"
            onClick={openModal}
            variant="subtle"
          />
        )}
      </Tooltip>
      <ErrorExplanationModal isModalOpen={isModalOpen} onClose={closeModal} />
    </Flex>
  );
});
