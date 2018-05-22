import React from "react";

import { PERIODICITY } from "metabase/xray/stats";

import { Heading } from "metabase/xray/components/XRayLayout";
import Histogram from "metabase/xray/Histogram";

const Periodicity = ({ xray }) => (
  <div>
    <Heading heading="Time breakdown" />,
    <div className="bg-white bordered rounded shadowed">
      <div className="Grid Grid--gutters Grid--1of4">
        {PERIODICITY.map(
          period =>
            xray[`histogram-${period}`] &&
            xray[`histogram-${period}`].value && (
              <div className="Grid-cell">
                <div className="p4 border-right border-bottom">
                  <div style={{ height: 120 }}>
                    <h4>{xray[`histogram-${period}`].label}</h4>
                    <Histogram
                      histogram={xray[`histogram-${period}`].value}
                      axis={false}
                    />
                  </div>
                </div>
              </div>
            ),
        )}
      </div>
    </div>
  </div>
);

export default Periodicity;
