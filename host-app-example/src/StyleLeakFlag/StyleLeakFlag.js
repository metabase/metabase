import React, { useState, useEffect, useRef } from 'react';

export const StyleLeakFlag = () => {
  const [currentFontFamily, setCurrentFontFamily] = useState('');
  const [currentFontSize, setCurrentFontSize] = useState('');
  const divRef = useRef(null);

  useEffect(() => {
    const checkFontStyle = () => {
      if (divRef.current) {
        const computedStyle = window.getComputedStyle(divRef.current);
        const fontFamily = computedStyle.fontFamily.replace(/['"]+/g, '');
        const fontSize = computedStyle.fontSize;
        setCurrentFontFamily(fontFamily.split(", ")[0]);
        setCurrentFontSize(fontSize);
      }
    };

    checkFontStyle();
    const intervalId = setInterval(checkFontStyle, 1000);

    return () => clearInterval(intervalId);
  }, []);
  
  const isFontLeaking = currentFontFamily !== 'IBM Plex Sans' || currentFontSize !== '16px';
  const pillClasses = isFontLeaking ? "tw-bg-red-400" : "tw-bg-green-400";
  const pillText = isFontLeaking ? "Fonts are leaking 🫠" : "Fonts aren't leaking 😎";

  return (
    <>
      <div
        className={
          `tw-text-white tw-font-bold tw-grid tw-place-items-center tw-px-2 tw-py-1 tw-rounded ${pillClasses}`
        }
        ref={divRef}
      >
        {pillText}
      </div>
    </>
  );
};
