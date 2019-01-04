import React from "react";

import cx from "classnames";
import { t } from "c-3po";
import { assocIn } from "icepick";

import Button from "metabase/components/Button";

import Visualization from "metabase/visualizations/components/Visualization.jsx";

import ExpressionEditorTextfield from "../expressions/ExpressionEditorTextfield";

// import { Dimension } from "./FieldsBar";

const MIN_PREVIEW_WIDTH = 300;

const HEADER_HEIGHT = 48;
const SUB_HEADER_HEIGHT = 54;

function getFakePreviewSeries(query) {
  const card = query.question().card();
  const cols = query.columns();
  if (cols.length === 0) {
    return null;
  }
  const data = { rows: [], cols: cols, columns: cols.map(col => col.name) };
  return [{ card, data }];
}

export default class Preview extends React.Component {
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
      isPreviewCurrent,
      isPreviewDisabled,
      ...props
    } = this.props;
    const { tableWidth } = this.state;

    // force table
    const fakeSeries = getFakePreviewSeries(query);
    const previewSeries = isPreviewCurrent ? props.rawSeries : fakeSeries;
    const rawSeries =
      previewSeries && assocIn(previewSeries, [0, "card", "display"], "table");

    const showExpressionEditor = false;

    return (
      <div
        style={{
          height: 350,
          maxWidth: Math.max((tableWidth || 0) + 2, MIN_PREVIEW_WIDTH),
        }}
        className={cx("bordered rounded bg-white relative", {
          disabled: isPreviewDisabled,
        })}
      >
        {rawSeries && (
          <Visualization
            {...props}
            className="spread"
            rawSeries={rawSeries}
            onContentWidthChange={this.handleWidthChange}
            tableHeaderHeight={
              HEADER_HEIGHT + (showExpressionEditor ? SUB_HEADER_HEIGHT : 0)
            }
            // renderTableHeaderWrapper={(children, column) => {
            //   const dimension = query.dimensionForColumn(column);
            //   const icon = dimension && dimension.field().icon();
            //   return (
            //     <Dimension
            //       className="flex align-center flex-full cellData align-self-start"
            //       style={{
            //         marginLeft: "0.5em",
            //         marginRight: 0,
            //         marginTop: "0.5em",
            //         // height: HEADER_HEIGHT,
            //       }}
            //       icon={icon}
            //     >
            //       {children}
            //     </Dimension>
            //   );
            // }}
          />
        )}
        {rawSeries &&
          showExpressionEditor && (
            <div
              className="absolute left right px1"
              style={{
                top: HEADER_HEIGHT,
                height: SUB_HEADER_HEIGHT,
              }}
            >
              <ExpressionEditorTextfield
                className="bg-white"
                style={{
                  margin: 0,
                }}
                expression={null}
                tableMetadata={query.tableMetadata()}
                onChange={parsedExpression =>
                  this.setState({ expression: parsedExpression, error: null })
                }
                onError={errorMessage => this.setState({ error: errorMessage })}
              />
            </div>
          )}
        {this.props.isRunning ? (
          <div className="spread flex layout-centered">Loading...</div>
        ) : !isPreviewCurrent ? (
          <div
            onClick={preview}
            className="cursor-pointer spread flex layout-centered"
          >
            <Button round>{t`Show preview`}</Button>
          </div>
        ) : null}
      </div>
    );
  }
}
