import PropTypes from "prop-types";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "metabase/core/components/Icon";
import { Button, Loader } from "metabase/ui";
import { Popover, Tooltip } from "metabase/ui/components/overlays";

import { LegendDescriptionIcon } from "./legend/LegendCaption.styled";

export const defaultExplanation = "hang tight ...";

export const ChartExplainerType = {
  DESCRIPTION: "description",
  SUMMARY: "summary",
};

const ChartExplainerConfig = {
  [ChartExplainerType.DESCRIPTION]: {
    name: "Chart Explainer",
    description: "AI-generated description of chart",
    tooltip: "Click here to understand the chart’s objective",
    targetIcon: "info_filled",
  },
  [ChartExplainerType.SUMMARY]: {
    name: "Chart Summary",
    description: "AI-generated summary of the chart’s data",
    tooltip: "Click here to understand the chart’s data",
    targetIcon: "faros",
  },
};

function getPostMessage(explanation, setError, type, title, chartExtras) {
  return () => {
    if (window.parent !== window && explanation === defaultExplanation) {
      const messageData = {
        lighthouse: {
          type: "ChartExplainer",
          payload: { ...chartExtras, title, type },
        },
      };
      setError(false);
      window.parent.postMessage(messageData, "*");
    }
  };
}

function getMessageHandler(setExplanation, setError, type, chartExtras) {
  return event => {
    if (
      event &&
      event.source === window.parent &&
      event.data?.lighthouse?.type === "ChartExplainer" &&
      event.data?.lighthouse?.payload?.type === type
    ) {
      const {
        dashboard_id: dashboardId,
        id,
        explanation: chartExplanation,
        error,
      } = event.data.lighthouse.payload;

      if (chartExtras?.dashboard_id === dashboardId && chartExtras?.id === id) {
        if (
          !error &&
          !!chartExplanation &&
          !chartExplanation?.startsWith("Hello")
        ) {
          setExplanation(chartExplanation);
        } else {
          setError(true);
        }
      }
    }
  };
}

export const CloseButton = ({ setOpened }) => (
  <Button
    color="#023D67"
    style={{
      background: "#023D67",
    }}
    styles={{
      root: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignContent: "center",
        padding: "0px",
        gap: "8px",
        width: "32px",
        height: "32px",
        borderRadius: "6px",
        flex: "none",
        order: 2,
        flexGrow: 0,
        background: "#023D67",
        border: "none",
      },
    }}
    onClick={() => setOpened(false)}
  >
    <Icon
      name="close"
      style={{
        width: "20px",
        height: "20px",
        fill: "white",
      }}
    />
  </Button>
);

CloseButton.propTypes = {
  setOpened: PropTypes.func.isRequired,
};

const Header = ({ type, setOpened }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "flex-start",
      padding: "0px",
      gap: "12px",
      width: "392px",
      height: "50px",
      flex: "none",
      order: 0,
      alignSelf: "stretch",
      flexGrow: 0,
    }}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "0px",
        gap: "16px",
        width: "348px",
        height: "50px",
        flex: "none",
        order: 1,
        flexGrow: 1,
      }}
    >
      <Icon
        name="faros"
        style={{
          width: "40px",
          height: "40px",
          flex: "None",
          order: 0,
          flexGrow: 0,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          width: "292px",
          height: "50px",
          flex: "none",
          order: 1,
          flexGrow: 1,
        }}
      >
        <div
          style={{
            width: "292px",
            height: "29px",
            fontFamily: "Lato",
            fontStyle: "normal",
            fontWeight: 600,
            fontSize: "19px",
            lineHeight: "150%",
            display: "flex",
            alignItems: "center",
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {ChartExplainerConfig[type].name}
        </div>
        <div
          style={{
            width: "292px",
            height: "21px",
            fontFamily: "Lato",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "150%",
            display: "flex",
            alignItems: "center",
            color: "#8EBFD6",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {ChartExplainerConfig[type].description}
        </div>
      </div>
    </div>
    <CloseButton setOpened={setOpened} />
  </div>
);

Header.propTypes = {
  type: PropTypes.oneOf(Object.values(ChartExplainerType)).isRequired,
  setOpened: PropTypes.func.isRequired,
};

const Loading = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      padding: "24px",
      gap: "24px",
      width: "392px",
      height: "205px",
      flex: "none",
      order: 2,
      alignSelf: "stretch",
      flexGrow: 0,
    }}
  >
    <Loader size={72} color="#15B1D7" />
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0px",
        gap: "8px",
        width: "344px",
        height: "61px",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
      }}
    >
      <div
        style={{
          width: "344px",
          height: "29px",
          fontFamily: "Lato",
          fontStyle: "normal",
          fontWeight: 600,
          fontSize: "19px",
          lineHeight: "150%",
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          color: "#FFFFFF",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
          justifyContent: "center",
        }}
      >
        Getting your answer ...
      </div>
      <div
        style={{
          width: "344px",
          height: "24px",
          fontFamily: "Lato",
          fontStyle: "normal",
          fontWeight: 400,
          fontSize: "16px",
          lineHeight: "150%",
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          color: "#8EBFD6",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
          justifyContent: "center",
        }}
      >
        Sit back while we craft the perfect answer!
      </div>
    </div>
  </div>
);

const Error = ({ postMessage }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px",
      gap: "10px",
      width: "392px",
      height: "fit-content",
      flex: "none",
      order: 1,
      alignSelf: "stretch",
      flexGrow: 0,
    }}
  >
    <Icon
      name="disconnected_plug"
      style={{
        width: "72px",
        height: "72px",
        flex: "none",
        order: 0,
        flexGrow: 0,
      }}
    />
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0px",
        gap: "8px",
        width: "344px",
        height: "85px",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
      }}
    >
      <div
        style={{
          width: "344px",
          height: "29px",
          fontFamily: "Lato",
          fontStyle: "normal",
          fontWeight: 600,
          fontSize: "19px",
          lineHeight: "150%",
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          color: "#FFFFFF",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
          justifyContent: "center",
        }}
      >
        Unable to connect to Lighthouse AI
      </div>
      <div
        style={{
          width: "344px",
          height: "48px",
          fontFamily: "Lato",
          fontStyle: "normal",
          fontWeight: 400,
          fontSize: "16px",
          lineHeight: "150%",
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          color: "#8EBFD6",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
          justifyContent: "center",
        }}
      >
        If the problem persists, reach out to our support team for further
        assistance.
      </div>
    </div>
    <Button
      leftIcon={<Icon name="arrow_repeat" width={20} height={20} />}
      radius="md"
      size="md"
      onClick={() => postMessage()}
      style={{
        order: 2,
      }}
    >
      Try Again
    </Button>
  </div>
);

Error.propTypes = {
  postMessage: PropTypes.func.isRequired,
};

const Explanation = ({ explanation }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      padding: "0px",
      gap: "12px",
      width: "392px",
      height: "fit-content",
      flex: "none",
      order: 1,
      alignSelf: "stretch",
      flexGrow: 0,
    }}
  >
    <div
      style={{
        width: "392px",
        maxHeight: "240px",
        overflow: "auto",
        fontFamily: "Lato",
        fontStyle: "normal",
        fontWeight: 400,
        fontSize: "16px",
        lineHeight: "150%",
        display: "flex",
        alignItems: "center",
        color: "#E2EFF4",
        flex: "none",
        order: 0,
        alignSelf: "stretch",
        flexGrow: 0,
      }}
    >
      {explanation}
    </div>
  </div>
);

Explanation.propTypes = {
  explanation: PropTypes.string.isRequired,
};

const ChartExplainer = ({
  type,
  explanation,
  error,
  setOpened,
  postMessage,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      padding: "16px 24px",
      gap: "24px",
      width: "440px",
      maxHeight: "fit-content",
      background: "#023D67",
      borderRadius: "6px",
      flex: "none",
      order: 0,
      alignSelf: "stretch",
      flexGrow: 0,
    }}
  >
    <Header type={type} setOpened={setOpened} />
    {error ? (
      <Error postMessage={postMessage} />
    ) : explanation === defaultExplanation ? (
      <Loading />
    ) : (
      <Explanation explanation={explanation} />
    )}
  </div>
);

ChartExplainer.propTypes = {
  type: PropTypes.oneOf(Object.values(ChartExplainerType)).isRequired,
  explanation: PropTypes.string.isRequired,
  error: PropTypes.bool.isRequired,
  setOpened: PropTypes.func.isRequired,
  postMessage: PropTypes.func.isRequired,
};

export const ChartExplainerPopover = ({ type, title, chartExtras }) => {
  const [explanation, setExplanation] = useState(defaultExplanation);
  const [error, setError] = useState(false);
  const [popoverOpened, setPopoverOpened] = useState(false);
  const [tooltipOpened, setTooltipOpened] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const postMessage = useCallback(
    getPostMessage(explanation, setError, type, title, chartExtras),
    [explanation, setError, type, title, chartExtras],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleMessage = useCallback(
    getMessageHandler(setExplanation, setError, type, chartExtras),
    [setExplanation, setError, type, chartExtras],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  return (
    <Popover
      opened={popoverOpened}
      onOpen={() => {
        setTooltipOpened(false);
        postMessage();
      }}
      onChange={setPopoverOpened}
      position="top"
      offset={5}
      withArrow
      arrowSize={14}
      styles={{
        arrow: { backgroundColor: "#023D67" },
      }}
      zIndex={3}
    >
      <Popover.Target>
        <Tooltip
          label={ChartExplainerConfig[type].tooltip}
          withArrow
          arrowPosition="center"
          arrowSize={7}
          opened={tooltipOpened}
          style={{
            background: "#023D67",
          }}
        >
          <LegendDescriptionIcon
            name={ChartExplainerConfig[type].targetIcon}
            className="hover-child hover-child--smooth"
            fill="#023D67"
            style={{
              verticalAlign: "bottom",
              paddingBottom: "0.5px",
              paddingRight: "0.25rem",
            }}
            onClick={() => setPopoverOpened(o => !o)}
            onMouseEnter={() => {
              if (!popoverOpened) {
                setTooltipOpened(true);
              }
            }}
            onMouseLeave={() => setTooltipOpened(false)}
          />
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <ChartExplainer
          type={type}
          explanation={explanation}
          error={error}
          setOpened={setPopoverOpened}
          postMessage={postMessage}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

ChartExplainerPopover.propTypes = {
  type: PropTypes.oneOf(Object.values(ChartExplainerType)).isRequired,
  title: PropTypes.string.isRequired,
  chartExtras: PropTypes.object.isRequired,
};
