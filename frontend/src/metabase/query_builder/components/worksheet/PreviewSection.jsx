import React from "react";
import ReactDOM from "react-dom";

import cx from "classnames";
import { t } from "c-3po";
import { assocIn } from "icepick";

import { formatColumn } from "metabase/lib/formatting";

import Button from "metabase/components/Button";
import RoundButtonWithIcon from "metabase/components/RoundButtonWithIcon";

import WorksheetSection from "./WorksheetSection";

import Visualization from "metabase/visualizations/components/Visualization.jsx";

import SECTIONS from "./style";

const MIN_PREVIEW_WIDTH = 300;

function getFakePreviewSeries(query) {
  const card = query.question().card();
  const cols = query.columns();
  const data = { rows: [], cols: cols, columns: cols.map(col => col.name) };
  return [{ card, data }];
}

class PreviewSection extends React.Component {
  state = {
    tableWidth: null,
  };

  handleWidthChange = tableWidth => {
    if (this.state.tableWidth !== tableWidth) {
      this.setState({ tableWidth });
    }
  };

  render() {
    const {
      query,
      preview,
      previewLimit,
      setPreviewLimit,
      children,
      style,
      className,
      isPreviewCurrent,
      isPreviewDisabled,
      ...props
    } = this.props;
    const { tableWidth } = this.state;

    // force table
    const rawSeries = assocIn(
      isPreviewCurrent ? props.rawSeries : getFakePreviewSeries(query),
      [0, "card", "display"],
      "table",
    );

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
          style={{
            height: 350,
            maxWidth: Math.max((tableWidth || 0) + 2, MIN_PREVIEW_WIDTH),
          }}
          className={cx("bordered rounded bg-white relative", {
            disabled: isPreviewDisabled,
          })}
        >
          <Visualization
            {...props}
            className="spread"
            rawSeries={rawSeries}
            onContentWidthChange={this.handleWidthChange}
          />
          {!isPreviewCurrent && (
            <div
              onClick={preview}
              className="cursor-pointer spread flex layout-centered"
            >
              <Button round>{t`Show preview`}</Button>
            </div>
          )}
        </div>
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
