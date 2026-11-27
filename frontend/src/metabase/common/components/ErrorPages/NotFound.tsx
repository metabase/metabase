import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Flex } from "metabase/ui";

import S from "./ErrorPages.module.css";

/**
 * Lives apart from the other error pages so that a module can show it without
 * the rest of the barrel, whose diagnostic modal and whitelabel selectors
 * reach back to the plugin slots.
 */
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values
      illustrationElement={<img src={NoResults} />}
      title={title}
      message={message}
    />
  </Flex>
);
