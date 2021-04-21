import React, { useState, useRef, useLayoutEffect } from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import cx from "classnames";
import { t } from "ttag";
import Button from "metabase/components/Button";

const ClampedDiv = styled.div`
  position: relative;
  max-height: ${props =>
    props.visibleLines == null
      ? "unset"
      : `calc(1.5em * ${props.visibleLines})`};
  overflow: hidden;
  padding-right: 1rem;
  line-height: 1.5em;
  font-size: 1em;
`;

function ClampedText({ className, text, visibleLines }) {
  const [isClamped, setIsClamped] = useState(true);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const clampedDiv = useRef();
  const innerDiv = useRef();

  useLayoutEffect(() => {
    const clampedHeight = clampedDiv.current.getBoundingClientRect().height;
    const textHeight = innerDiv.current.getBoundingClientRect().height;

    if (textHeight > clampedHeight) {
      setIsOverflowing(true);
    }
  }, [text]);

  return (
    <div className={cx("clamped-text", className)}>
      <ClampedDiv
        innerRef={clampedDiv}
        visibleLines={isClamped ? visibleLines : undefined}
      >
        <div ref={innerDiv}>{text}</div>
      </ClampedDiv>
      <div>
        {isOverflowing && (
          <Button
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
