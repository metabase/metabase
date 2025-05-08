import cx from "classnames";

import Styles from "./MetabotIcon.module.css";

const COLORS = {
  brand: "var(--mb-color-brand)",
  brandLighter: "var(--mb-color-brand-lighter)",
  focus: "var(--mb-color-focus)",
  summarize: "var(--mb-color-summarize)",
};

export const MetabotIcon = ({ isLoading }: { isLoading: boolean }) => {
  const dotsStrokeColor = isLoading ? COLORS.summarize : COLORS.brand;
  const dotsFillColor = isLoading ? COLORS.summarize : COLORS.focus;

  return (
    <svg
      width="33"
      height="24"
      viewBox="0 0 33 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0.75"
        y="0.75"
        width="30.8721"
        height="22.5"
        rx="3.25"
        fill={COLORS.focus}
        stroke={COLORS.brand}
        strokeWidth="1.5"
      />
      <rect
        x="3.90698"
        y="3.34961"
        width="24.5581"
        height="14.5116"
        rx="2"
        fill={COLORS.brandLighter}
        stroke={COLORS.brand}
        strokeWidth="1.5"
      />
      {isLoading && (
        <>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M18 13H15V12H18V13Z"
            fill={COLORS.brand}
          />
          <path
            d="M10 8.5C10 9 10.8 10 12 10C13.2 10 13.8333 9 14 8.5"
            stroke={COLORS.brand}
          />
          <path
            d="M19 8.5C19 9 19.8 10 21 10C22.2 10 22.8333 9 23 8.5"
            stroke={COLORS.brand}
          />
        </>
      )}
      {!isLoading && (
        <>
          <path
            d="M17.3023 11.4414H17.8605C17.8605 12.4289 17.2754 13.1158 16.186 13.1158C15.0967 13.1158 14.5116 12.4289 14.5116 11.4414H15.0698C15.0698 11.9995 15.3488 12.5577 16.186 12.5577C17.0233 12.5577 17.3023 11.9995 17.3023 11.4414Z"
            fill={COLORS.brand}
          />
          <circle cx="11.5814" cy="8.7912" r="0.976744" fill={COLORS.brand} />
          <ellipse
            cx="20.5117"
            cy="8.7912"
            rx="0.976745"
            ry="0.976744"
            fill={COLORS.brand}
          />
        </>
      )}
      {/* dots */}
      {isLoading && (
        <circle
          cx="21.1163"
          cy="20.6509"
          r="1.11628"
          fill={dotsFillColor}
          className={cx(
            Styles.dot,
            isLoading && Styles.dotLoading,
            isLoading && Styles.dotOneLoading,
          )}
        />
      )}
      <path
        d="M27.9651 20.6514C27.9651 20.9918 27.6892 21.2677 27.3488 21.2677C27.0085 21.2677 26.7325 20.9918 26.7325 20.6514C26.7325 20.3111 27.0085 20.0352 27.3488 20.0352C27.6892 20.0352 27.9651 20.3111 27.9651 20.6514Z"
        fill={dotsFillColor}
        stroke={dotsStrokeColor}
        className={cx(
          Styles.dot,
          isLoading && Styles.dotLoading,
          isLoading && Styles.dotTwoLoading,
        )}
      />
      <circle
        cx="24.2791"
        cy="20.6514"
        r="0.61628"
        fill={dotsFillColor}
        stroke={dotsStrokeColor}
        className={cx(
          Styles.dot,
          isLoading && Styles.dotLoading,
          isLoading && Styles.dotThreeLoading,
        )}
      />
    </svg>
  );
};
