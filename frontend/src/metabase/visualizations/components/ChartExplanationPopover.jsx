import PropTypes from "prop-types";

import { Icon } from "metabase/core/components/Icon";

export const defaultExplanation = "hang tight ...";

export function getPopoverHandler(
  explanation,
  isExplanationOpen,
  setIsExplanationOpen,
  title,
  chartExtras,
) {
  return event => {
    if (window.parent !== window && explanation === defaultExplanation) {
      const messageData = {
        lighthouse: {
          type: "ChartExplainer",
          payload: { ...chartExtras, title },
        },
      };
      window.parent.postMessage(messageData, "*");
    }
    setIsExplanationOpen(!isExplanationOpen);
  };
}

export function getMessageHandler(setExplanation, chartExtras) {
  return event => {
    if (
      event &&
      event.source === window.parent &&
      event.data?.lighthouse?.type === "ChartExplainer"
    ) {
      const {
        dashboard_id: dashboardId,
        id,
        explanation: chartExplanation,
      } = event.data.lighthouse.payload;

      if (
        chartExtras?.dashboard_id === dashboardId &&
        chartExtras["id"] === id
      ) {
        setExplanation(chartExplanation);
      }
    }
  };
}

export const ChartExplanationPopover = ({ explanation, handlePopover }) => (
  <div
    style={{
      display: "flex",
      padding: "16px",
      flexDirection: "column",
      alignItems: "flex-start",
      alignSelf: "stretch",
      borderRadius: "4px",
      background: "var(--background-dark, #023D67)",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          flex: "1 0 0",
          color: "var(--text-dark-header, #FFF)",
          fontFamily: "Lato",
          fontSize: "19px",
          fontStyle: "normal",
          fontWeight: 600,
          lineHeight: "28.5px",
          marginBottom: "12px",
        }}
      >
        <Icon
          name="faros"
          style={{ width: "24px", height: "24px", marginRight: "12px" }}
        />
        <span style={{ verticalAlign: "text-bottom" }}>Chart Explainer</span>
      </span>
      <Icon
        name="close"
        style={{ width: "20px", height: "20px", fill: "white" }}
        onClick={handlePopover}
      />
    </div>
    <span
      style={{
        alignSelf: "stretch",
        color: "var(--text-dark-body-subtle, #8EBFD6)",
        fontFamily: "Lato",
        fontSize: "16px",
        fontStyle: "normal",
        fontWeight: 400,
        lineHeight: "24px",
      }}
    >
      {explanation}
    </span>
  </div>
);

ChartExplanationPopover.propTypes = {
  explanation: PropTypes.string.isRequired,
  handlePopover: PropTypes.func.isRequired,
};
