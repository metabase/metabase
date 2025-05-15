/* eslint-disable no-color-literals */

import cx from "classnames";
import type { SVGProps } from "react";

import Styles from "./MetabotIcon.module.css";

interface MetabotIconProps extends SVGProps<SVGSVGElement> {
  isLoading: boolean;
}

export const MetabotIcon = ({ isLoading, ...props }: MetabotIconProps) => {
  return (
    <svg
      width="40"
      height="30"
      viewBox="0 0 40 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="28.5"
        rx="3.25"
        fill="#CBE2F7"
        stroke="#509EE3"
        strokeWidth="1.5"
      />
      <rect
        x="4.82764"
        y="4.18604"
        width="30.3448"
        height="18.1395"
        rx="2"
        fill="#EEF6FD"
        stroke="#509EE3"
        strokeWidth="1.5"
      />

      {isLoading && (
        <>
          <circle
            className={cx(Styles.dot, Styles.dotOne)}
            cx="12"
            cy="13"
            r="1.5"
            fill="#7173AD"
          />
          <circle
            className={cx(Styles.dot, Styles.dotTwo)}
            cx="16"
            cy="13"
            r="1.5"
            fill="#98D9D9"
          />
          <circle
            className={cx(Styles.dot, Styles.dotThree)}
            cx="20"
            cy="13"
            r="1.5"
            fill="#A989C5"
          />
          <circle
            className={cx(Styles.dot, Styles.dotFour)}
            cx="24"
            cy="13"
            r="1.5"
            fill="#EF8C8C"
          />
          <circle
            className={cx(Styles.dot, Styles.dotFive)}
            cx="28"
            cy="13"
            r="1.5"
            fill="#F2A86F"
          />
        </>
      )}

      {!isLoading && (
        <>
          <ellipse
            cx="14.3104"
            cy="10.9884"
            rx="1.2069"
            ry="1.22093"
            fill="#509EE3"
          />
          <ellipse
            cx="25.3446"
            cy="10.9884"
            rx="1.2069"
            ry="1.22093"
            fill="#509EE3"
          />
          <path
            d="M21.3794 14.3024H22.0691C22.0691 15.5368 21.3461 16.3954 20.0001 16.3954C18.6541 16.3954 17.9312 15.5368 17.9312 14.3024H18.6208C18.6208 15 18.9656 15.6977 20.0001 15.6977C21.0346 15.6977 21.3794 15 21.3794 14.3024Z"
            fill="#509EE3"
          />
        </>
      )}

      <path
        d="M29.9995 24.9186C30.4797 24.9186 30.8794 25.3141 30.8794 25.8141C30.8793 26.314 30.4797 26.7096 29.9995 26.7096C29.5195 26.7094 29.1207 26.3138 29.1206 25.8141C29.1206 25.3143 29.5195 24.9188 29.9995 24.9186Z"
        fill="#CBE2F7"
        stroke="#509EE3"
      />
      <path
        d="M33.7925 24.9186C34.2727 24.9186 34.6724 25.3141 34.6724 25.8141C34.6723 26.314 34.2726 26.7096 33.7925 26.7096C33.3125 26.7094 32.9137 26.3138 32.9136 25.8141C32.9136 25.3143 33.3125 24.9188 33.7925 24.9186Z"
        fill="#CBE2F7"
        stroke="#509EE3"
      />
    </svg>
  );
};
