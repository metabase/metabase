import React, { useState, useRef, useLayoutEffect } from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import cx from "classnames";
import { t } from "ttag";
import Button from "metabase/components/Button";

const ClampedDiv = styled.div`
  max-height: ${props =>
    props.visibleLines == null
      ? "unset"
      : `calc(1.5em * ${props.visibleLines})`};
  overflow: hidden;
  line-height: 1.5em;
  font-size: 1em;
  white-space: pre-line;
`;

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

    if (textHeight > clampedHeight) {
      setIsOverflowing(true);
    }
  }, [text]);

  return (
    <div className={cx("clamped-text", className)}>
      <ClampedDiv
        className="clamped-text--clamp"
        innerRef={clampedDiv}
        visibleLines={isClamped ? visibleLines : undefined}
      >
        <div ref={innerDiv} className="clamped-text--text">
          {text}
        </div>
      </ClampedDiv>
      <div className="clamped-text--footer">
        {isOverflowing && (
          <Button
            className="clamped-text--toggle"
            borderless
            onClick={() => setIsClamped(isClamped => !isClamped)}
          >
            {isClamped ? t`See more` : t`See less`}
          </Button>
        )}
      </div>
    </div>
  );
}

ClampedText.propTypes = {
  className: PropTypes.string,
  text: PropTypes.string,
  visibleLines: PropTypes.number,
};

export default ClampedText;
