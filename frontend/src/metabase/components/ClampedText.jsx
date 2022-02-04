import React, { useState, useRef, useLayoutEffect } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";

import styled from "styled-components";
import { ClampedDiv } from "./ClampedText.styled";
import { TextButton } from "metabase/components/Button.styled";

const PaddedTextButton = styled(TextButton)`
  margin: 0.5rem 0;
`;

ClampedText.propTypes = {
  className: PropTypes.string,
  text: PropTypes.string,
  visibleLines: PropTypes.number,
};

function ClampedText({ className, text, visibleLines }) {
  const [isClamped, setIsClamped] = useState(true);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const clampedDiv = useRef();
  const innerDiv = useRef();

  useLayoutEffect(() => {
    if (!clampedDiv.current || !innerDiv.current) {
      return;
    }

    const clampedHeight = clampedDiv.current.getBoundingClientRect().height;
    const textHeight = innerDiv.current.getBoundingClientRect().height;

    setIsOverflowing(textHeight > clampedHeight);
  }, [text]);

  return (
    <div className={cx("clamped-text", className)}>
      <ClampedDiv
        innerRef={clampedDiv}
        visibleLines={isClamped ? visibleLines : undefined}
      >
        <div className="clamped-text--text" ref={innerDiv}>
          {text}
        </div>
      </ClampedDiv>
      <div>
        {isOverflowing && (
          <PaddedTextButton
            onClick={() => setIsClamped(isClamped => !isClamped)}
          >
            {isClamped ? t`See more` : t`See less`}
          </PaddedTextButton>
        )}
      </div>
    </div>
  );
}

export default ClampedText;
