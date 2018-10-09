import React from "react";
import { t } from "c-3po";

import DashCardCardParameterMapper from "../containers/DashCardCardParameterMapper.jsx";

import colors from "metabase/lib/colors";

const DashCardParameterMapper = ({ dashcard }) => (
  <div className="relative flex-full flex flex-column layout-centered">
    {dashcard.series &&
      dashcard.series.length > 0 && (
        <div
          className="mx4 my1 p1 rounded"
          style={{
            backgroundColor: colors["bg-light"],
            color: colors["text-medium"],
            marginTop: -10,
          }}
        >
          {t`Make sure to make a selection for each series, or the filter won't work on this card.`}
        </div>
      )}
    <div className="flex mx4 z1" style={{ justifyContent: "space-around" }}>
      {[dashcard.card]
        .concat(dashcard.series || [])
        .map(card => (
          <DashCardCardParameterMapper
            key={`${dashcard.id},${card.id}`}
            dashcard={dashcard}
            card={card}
          />
        ))}
    </div>
  </div>
);

export default DashCardParameterMapper;
