import React from "react";
import cx from "classnames";
import { t } from "c-3po";

import RoundButtonWithIcon from "metabase/components/RoundButtonWithIcon";

import WorksheetSection from "./WorksheetSection";

import Visualization from "metabase/visualizations/components/Visualization.jsx";

import SECTIONS from "./style";

const PreviewSection = ({
  preview,
  previewLimit,
  setPreviewLimit,
  isPreviewCurrent,
  children,
  style,
  className,
  ...props
}) => {
  return (
    <WorksheetSection
      {...SECTIONS.preview}
      style={style}
      className={className}
      header={
        <div className="flex-full flex align-center justify-end">
          <PreviewLimitSelect
            previewLimit={previewLimit}
            setPreviewLimit={setPreviewLimit}
          />
          <PreviewRefreshButton onClick={preview} className="ml1" />
        </div>
      }
    >
      <div
        style={{ height: 350, width: "100%" }}
        className="bordered rounded bg-white relative"
      >
        {props.rawSeries && isPreviewCurrent ? (
          <Visualization {...props} />
        ) : !props.isRunning ? (
          <div
            onClick={preview}
            className="cursor-pointer spread flex layout-centered"
          >
            <span className="text-medium h3">{t`Show preview`}</span>
          </div>
        ) : null}
      </div>
      {children && <div className="mt2">{children}</div>}
    </WorksheetSection>
  );
};

const PreviewRefreshButton = ({ className, ...props }) => (
  <RoundButtonWithIcon
    icon="refresh"
    className={cx(className, "bg-medium text-brand")}
    {...props}
  />
);

const PreviewLimitSelect = ({ previewLimit, setPreviewLimit }) => (
  <select
    value={previewLimit}
    onChange={e => setPreviewLimit(parseInt(e.target.value))}
  >
    {[10, 100, 1000].map(limit => (
      <option key={limit} value={limit}>
        {limit} rows
      </option>
    ))}
  </select>
);

export default PreviewSection;
