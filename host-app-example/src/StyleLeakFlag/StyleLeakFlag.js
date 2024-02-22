import React, { useState, useEffect, useRef } from 'react';

export const StyleLeakFlag = () => {
  const [styleInfo, setStyleInfo] = useState('');
  const divRef = useRef(null);

  useEffect(() => {
    const checkFontStyle = () => {
      if (divRef.current) {
        const computedStyle = window.getComputedStyle(divRef.current);
        const fontFamily = computedStyle.fontFamily.replace(/['"]+/g, '');
        const fontSize = computedStyle.fontSize;
        setStyleInfo(`Current font is ${fontFamily}, ${fontSize}`);
      }
    };

    checkFontStyle();
    const intervalId = setInterval(checkFontStyle, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return (
      <div ref={divRef}>
        This should be IBM Sans, 16px. <br />
        {styleInfo}
      </div>
  );
};
