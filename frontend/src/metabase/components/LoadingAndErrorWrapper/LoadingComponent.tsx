import { useInterval } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { useMount, useUnmount } from "react-use";

import type { LoadingAndErrorWrapperProps } from "metabase/components/LoadingAndErrorWrapper/types";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";

type LoadingComponentProps = Pick<
  LoadingAndErrorWrapperProps,
  | "className"
  | "loadingMessages"
  | "loadingScenes"
  | "showSpinner"
  | "messageInterval"
>;

export const LoadingComponent = ({
  className,
  loadingMessages = [],
  loadingScenes,
  showSpinner,
  messageInterval = 6000,
}: LoadingComponentProps) => {
  const [messageIndex, setMessageIndex] = useState(0);

  // TODO: should this be cycling as well?
  const [sceneIndex] = useState(0);

  const loadingInterval = () => {
    setMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
  };

  const interval = useInterval(loadingInterval, messageInterval);

  useMount(() => {
    // only start cycling if multiple messages are provided
    if (loadingMessages.length > 1) {
      interval.start();
    }
  });

  useUnmount(() => {
    interval.stop();
  });

  return (
    <div className={className}>
      {loadingScenes && loadingScenes[sceneIndex]}
      {!loadingScenes && showSpinner && <LoadingSpinner />}
      <h2 className={cx(CS.textNormal, CS.textLight, CS.mt1)}>
        {loadingMessages[messageIndex]}
      </h2>
    </div>
  );
};
