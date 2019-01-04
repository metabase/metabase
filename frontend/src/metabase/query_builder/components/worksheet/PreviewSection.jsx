import React from "react";

import cx from "classnames";

import RoundButtonWithIcon from "metabase/components/RoundButtonWithIcon";

import WorksheetSection from "./WorksheetSection";

import Preview from "./Preview";

import SECTIONS from "./style";

class PreviewSection extends React.Component {
  render() {
    const {
      preview,
      previewLimit,
      setPreviewLimit,
      children,
      style,
      className,
    } = this.props;

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
        <Preview {...this.props} />
        {children && <div className="mt2">{children}</div>}
      </WorksheetSection>
    );
  }
}

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
