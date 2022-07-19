/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import DashCardCardParameterMapper from "../components/DashCardCardParameterMapper";

import { color } from "metabase/lib/colors";

const DashCardParameterMapper = ({ dashcard, isMobile }) => (
  <div className="relative flex-full flex flex-column layout-centered">
    {dashcard.series && dashcard.series.length > 0 && (
      <div
        className="mx4 my1 p1 rounded"
        style={{
          backgroundColor: color("bg-light"),
          color: color("text-medium"),
          marginTop: -10,
        }}
      >
        {t`Make sure to make a selection for each series, or the filter won't work on this card.`}
      </div>
    )}
    <div className="flex mx4 z1" style={{ justifyContent: "space-around" }}>
      {[dashcard.card].concat(dashcard.series || []).map(card => (
        <DashCardCardParameterMapper
          key={`${dashcard.id},${card.id}`}
          dashcard={dashcard}
          card={card}
          isMobile={isMobile}
        />
      ))}
    </div>
  </div>
);

export default DashCardParameterMapper;
