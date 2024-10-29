import { jt, t } from "ttag";

import { duration } from "metabase/lib/formatting";

import {
  Duration,
  Root,
  ShortMessage,
  SlowQueryMessageContainer,
  StyledLoadingSpinner,
} from "./LoadingView.styled";

interface LoadingViewProps {
  isSlow: "usually-slow" | boolean;
  expectedDuration: number;
}

function SlowQueryView({ expectedDuration, isSlow }: LoadingViewProps) {
  return (
    <SlowQueryMessageContainer>
      <ShortMessage>{t`Still Waiting…`}</ShortMessage>
      {isSlow === "usually-slow" ? (
        <div>
          {jt`This usually takes an average of ${(
            <Duration key="duration">{duration(expectedDuration)}</Duration>
          )}, but is currently taking longer.`}
        </div>
      ) : (
        <div>
          {t`This usually loads immediately, but is currently taking longer.`}
        </div>
      )}
    </SlowQueryMessageContainer>
  );
}

function LoadingView({ expectedDuration, isSlow }: LoadingViewProps) {
  return (
    <Root>
      {isSlow ? (
        <SlowQueryView expectedDuration={expectedDuration} isSlow={isSlow} />
      ) : (
        <StyledLoadingSpinner />
      )}
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingView;
