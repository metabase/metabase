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
import { Button, Icon, Tooltip } from "metabase/ui";

import {
  ErrorDiagnosticModalTrigger,
  ErrorExplanationModal,
} from "./ErrorDiagnosticModal";
import { ErrorPageRoot } from "./ErrorPages.styled";

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
      <ErrorPageRoot ref={ref}>
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
      </ErrorPageRoot>
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
  <ErrorPageRoot aria-label="error page">
    <EmptyState
      illustrationElement={<img src={NoResults} />}
      title={title}
      message={message}
    />
  </ErrorPageRoot>
);

export const Unauthorized = () => (
  <ErrorPageRoot>
    <EmptyState
      title={t`Sorry, you don’t have permission to see that.`}
      illustrationElement={<Icon name="key" size={100} />}
    />
  </ErrorPageRoot>
);

export const Archived = ({
  entityName,
  linkTo,
}: {
  entityName: string;
  linkTo: string;
}) => (
  <ErrorPageRoot>
    <EmptyState
      title={t`This ${entityName} has been archived`}
      illustrationElement={<Icon name="view_archive" size={100} />}
      link={linkTo}
    />
  </ErrorPageRoot>
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
    <ErrorPageRoot bordered={bordered} {...props} ref={ref}>
      <Tooltip label={tooltipMessage}>
        {isEmbeddingIframe ? (
          <Icon name="warning" size={32} c="text-tertiary" />
        ) : (
          <Button
            leftSection={<Icon name="warning" size={32} c="text-tertiary" />}
            color="text-tertiary"
            onClick={openModal}
            variant="subtle"
          />
        )}
      </Tooltip>
      <ErrorExplanationModal isModalOpen={isModalOpen} onClose={closeModal} />
    </ErrorPageRoot>
  );
});
