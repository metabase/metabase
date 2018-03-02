import React from "react";
import { Link } from "react-router";

import Histogram from "metabase/xray/Histogram";
import SimpleStat from "metabase/xray/SimpleStat";

const Constituent = ({ constituent }) => (
  <Link
    to={`xray/field/${constituent.model.id}/approximate`}
    className="no-decoration"
  >
    <div className="Grid my3 bg-white bordered rounded shadowed shadow-hover no-decoration">
      <div className="Grid-cell Cell--1of3 border-right">
        <div className="p4">
          <h2 className="text-bold text-brand">
            {constituent.model.display_name}
          </h2>
          <p className="text-measure text-paragraph">
            {constituent.model.description}
          </p>

          <div className="flex align-center">
            {constituent.min && <SimpleStat stat={constituent.min} />}
            {constituent.max && <SimpleStat stat={constituent.max} />}
          </div>
        </div>
      </div>
      <div className="Grid-cell p3">
        <div style={{ height: 220 }}>
          {constituent.histogram && (
            <Histogram histogram={constituent.histogram.value} />
          )}
        </div>
      </div>
    </div>
  </Link>
);

export default Constituent;
