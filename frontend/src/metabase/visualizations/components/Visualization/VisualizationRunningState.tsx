import cx from "classnames";
import { useTimeout } from "react-use";

import QueryBuilderS from "metabase/css/query_builder.module.css";
import { useSelector } from "metabase/redux";
import { getWhiteLabeledLoadingMessageFactory } from "metabase/selectors/whitelabel";
import { Flex, Loader, Title } from "metabase/ui";

const SLOW_MESSAGE_TIMEOUT = 4000;

export function VisualizationRunningState({
  className = "",
}: {
  className?: string;
}) {
  const [isSlow] = useTimeout(SLOW_MESSAGE_TIMEOUT);

  const getLoadingMessage = useSelector(getWhiteLabeledLoadingMessageFactory);

  // show the slower loading message only when the loadingMessage is
  // not customized
  const message = getLoadingMessage(isSlow() ?? false);

  return (
    <Flex
      className={cx(className, QueryBuilderS.Overlay)}
      c="core-brand"
      direction="column"
      justify="center"
      align="center"
    >
      <Loader size="lg" />
      <Title c="core-brand" order={3} mt="xl">
        {message}
      </Title>
    </Flex>
  );
}
