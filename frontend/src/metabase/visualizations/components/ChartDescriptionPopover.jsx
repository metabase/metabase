import PropTypes from "prop-types";
import { useState } from "react";

import { Popover, Tooltip } from "metabase/ui/components/overlays";

import { CloseButton } from "./ChartExplainerPopover";
import { LegendDescriptionIcon } from "./legend/LegendCaption.styled";

const ChartDescription = ({ description, setOpened }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      padding: "16px 24px",
      gap: "24px",
      width: "440px",
      height: "fit-content",
      overflow: "auto",
      background: "#023D67",
      borderRadius: "6px",
      flex: "none",
      order: 0,
      alignSelf: "stretch",
      flexGrow: 0,
    }}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "0px",
        gap: "12px",
        width: "392px",
        height: "fit-content",
        overflow: "auto",
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
          gap: "12px",
          width: "392px",
          height: "32px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        <div
          style={{
            width: "348px",
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
            order: 1,
            flexGrow: 1,
          }}
        >
          Chart Explainer
        </div>
        <CloseButton setOpened={setOpened} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          gap: "12px",
          width: "392px",
          maxHeight: "fit-content",
          overflow: "auto",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        <div
          style={{
            width: "392px",
            maxHeight: "250px",
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
          {description}
        </div>
      </div>
    </div>
  </div>
);

ChartDescription.propTypes = {
  description: PropTypes.string.isRequired,
  setOpened: PropTypes.func.isRequired,
};

export const ChartDescriptionPopover = ({ description }) => {
  const [popoverOpened, setPopoverOpened] = useState(false);
  const [tooltipOpened, setTooltipOpened] = useState(false);

  return (
    <Popover
      opened={popoverOpened}
      onOpen={() => setTooltipOpened(false)}
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
          label="Click here to understand the chart’s objective"
          withArrow
          arrowPosition="center"
          arrowSize={7}
          opened={tooltipOpened}
          style={{
            background: "#023D67",
          }}
        >
          <LegendDescriptionIcon
            name="info_filled"
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
        <ChartDescription
          description={description}
          setOpened={setPopoverOpened}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

ChartDescriptionPopover.propTypes = {
  description: PropTypes.string.isRequired,
};
