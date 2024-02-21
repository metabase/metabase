import React, { useState, useEffect, useRef } from 'react';

export const StyleLeakFlag = () => {
  const [styleInfo, setStyleInfo] = useState(''); // Holds the font info
  const divRef = useRef(null); // Reference to the component's div

  useEffect(() => {
    const checkFontStyle = () => {
      if (divRef.current) {
        const computedStyle = window.getComputedStyle(divRef.current);
        const fontFamily = computedStyle.fontFamily.replace(/['"]+/g, ''); // Remove quotes
        const fontSize = computedStyle.fontSize;
        setStyleInfo(`Current font is ${fontFamily}, ${fontSize}`);
      }
    };

    checkFontStyle();
    const intervalId = setInterval(checkFontStyle, 1000); // Check every 1000ms (1 second)

    return () => clearInterval(intervalId);
  }, []);

  return (
      <div ref={divRef}>
        This should be IBM Sans, 16px. <br />
        {styleInfo}
      </div>
  );
};
