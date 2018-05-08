import React from "react";
import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";

const SimpleStat = ({ stat, showDescription }) => (
  <div>
    <div className="flex align-center">
      <h3 className="mr4 text-grey-4">{stat.label}</h3>
      {showDescription && (
        <Tooltip tooltip={stat.description}>
          <Icon name="infooutlined" />
        </Tooltip>
      )}
    </div>
    {/* call toString to ensure that values like true / false show up */}
    <h1 className="my1">{stat.value ? stat.value.toString() : "No value"}</h1>
  </div>
);

export default SimpleStat;
